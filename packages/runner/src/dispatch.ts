import { type Card, type Run, type RunStatus, readSettings } from "@dyarchia/core";
import { Kanban, KanbanError, Runs, type Store } from "@dyarchia/store";
import { appendFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { auditPrompt, auditorArgs, claudeCommand, implementerArgs, systemPrompt } from "./claude.ts";
import { Desktop, alive, retryAfterMs } from "./desktop.ts";
import { branchFor, checkout, commit, git, readiness, resolveBase } from "./git.ts";

export interface DispatcherOptions {
    store: Store;
    desktop?: Desktop;
    claude?: string[];
    pollMs?: number;
    heartbeatMs?: number;
}

export interface Claim {
    card: Card;
    base: string;
    branch: string;
    run: Run;
    fresh: boolean;
}

export interface Audit {
    card: Card;
    base: string;
    branch: string;
    run: Run;
}

interface Outcome {
    status: Exclude<RunStatus, "running">;
    started?: boolean;
    session?: string;
    error?: string;
    summary?: string;
    question?: string;
}

interface Launch {
    card: Card;
    run: Run;
    args: string[];
    prompt: string;
    header: string;
    onInit?: () => void;
}

const clip = (text: string, length = 4000) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);
const lastLine = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].at(-1);

async function* lines(stream: ReadableStream<Uint8Array>) {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of stream) {
        buffer += decoder.decode(chunk, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
            yield buffer.slice(0, end).replace(/\r$/, "");
            buffer = buffer.slice(end + 1);
        }
    }
    if (buffer) yield buffer;
}

const parse = (line: string): Record<string, any> | undefined => {
    try {
        return JSON.parse(line);
    } catch {
        return undefined;
    }
};

function killTree(pid: number) {
    if (process.platform === "win32") Bun.spawn(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore", windowsHide: true });
    else process.kill(pid, "SIGTERM");
}

/*
 * Runs the headless work of the board. claim() finds the Scheduled cards that are due (and running ones a human
 * unblocked or a dead runner left behind), holds what cannot start yet with the reason, and moves the rest to
 * Running as the system, one per repository. execute() checks out the card branch, drives the harness with
 * retries, commits what it left, returns the repository to its base branch and moves the card on. audits() and
 * audit() do the same for Ready cards that reached Review: the auditor reads the branch and gives its verdict.
 */
export class Dispatcher {
    readonly kanban: Kanban;
    readonly runs: Runs;
    readonly desktop: Desktop;
    private readonly pollMs: number;
    private readonly heartbeatMs: number;

    constructor(private readonly options: DispatcherOptions) {
        this.kanban = new Kanban(options.store);
        this.runs = new Runs(options.store);
        this.desktop = options.desktop ?? new Desktop({ store: options.store });
        this.pollMs = options.pollMs ?? 1000;
        this.heartbeatMs = options.heartbeatMs ?? 10_000;
    }

    private get claude() {
        return this.options.claude ?? claudeCommand();
    }

    /*
     * Starts everything that can start now and keeps going: whenever a card finishes, its repository is free
     * again, so the next card waiting on it starts right away. At the end Task Scheduler is set to match the board.
     */
    async dispatch(): Promise<number[]> {
        const started: number[] = [];
        const round = async (): Promise<void> => {
            const claims = await this.claim();
            const audits = await this.audits();
            started.push(...[...claims, ...audits].map((work) => work.card.id));
            await Promise.all([...claims.map((claim) => this.execute(claim).then(round)), ...audits.map((audit) => this.audit(audit))]);
        };
        await round();
        await this.desktop.sync({ kick: false });
        return started;
    }

    async claim(now = Date.now()): Promise<Claim[]> {
        this.runs.reap(now);
        this.runs.reapDead(alive, now);
        this.options.store.setMeta("dispatch.last", String(now));
        const cards = this.kanban.list();
        const orphans = cards.filter((card) => card.phase === "running" && card.route === "scheduled" && !this.runs.live(card.id, now));
        const due = cards
            .filter((card) => card.phase === "scheduled" && card.scheduledAt !== null && card.scheduledAt <= now)
            .sort((a, b) => b.priority - a.priority || a.scheduledAt! - b.scheduledAt!);
        const taken = new Set<string>();
        const claims: Claim[] = [];
        for (const card of [...orphans, ...due]) {
            const checked = await this.check(card, taken, now);
            const ready = ("base" in checked && card.phase === "scheduled" && this.capped(card, now)) || checked;
            if ("held" in ready) {
                this.kanban.hold(card.id, ready.held, now + retryAfterMs);
                continue;
            }
            const claim = this.take(card, ready.base, now);
            if (!claim) continue;
            taken.add(card.folder!);
            claims.push(claim);
        }
        return claims;
    }

    /*
     * A card waits while its board, or every board together, already runs as many cards as it allows. Claims made
     * earlier in the same round already started their run, so they are counted too. A card whose run was left
     * behind is not counted again: it already holds its place.
     */
    private capped(card: Card, now: number): { held: string } | undefined {
        const { name, maxRunning } = this.kanban.board(card.board);
        const all = readSettings((key) => this.options.store.getSetting(key)).maxRunning;
        const cards = (count: number) => `${count} card${count > 1 ? "s" : ""}`;
        if (this.runs.running(card.board, now) >= maxRunning) return { held: `${name} already runs ${cards(maxRunning)} at once` };
        if (this.runs.running(undefined, now) >= all) return { held: `All boards already run ${cards(all)} at once` };
        return undefined;
    }

    private async check(card: Card, taken: Set<string>, now: number): Promise<{ base: string } | { held: string }> {
        if (card.implementer.harness !== "claude-code") return { held: `${card.implementer.harness ?? "This harness"} cannot run headless yet; Scheduled runs use claude-code` };
        if (!this.claude) return { held: "claude was not found on PATH" };
        if (!card.folder) return { held: "The card has no folder" };
        if (card.phase === "scheduled") {
            const reason = this.kanban.targets(card.id, "system", now).find((target) => target.to === "running")?.reason;
            if (reason) return { held: reason };
        }
        if (taken.has(card.folder) || this.runs.busy(card.folder, now)) return { held: `Another card is running in ${basename(card.folder)}` };
        return readiness(card.folder, card.baseBranch, card.phase === "running" ? branchFor(card.id, card.title) : undefined);
    }

    private take(card: Card, base: string, now: number): Claim | undefined {
        const branch = branchFor(card.id, card.title);
        try {
            return this.options.store.db
                .transaction(() => {
                    if (this.runs.busy(card.folder!, now) || this.runs.live(card.id, now)) return undefined;
                    const fresh = card.phase === "scheduled";
                    const current = fresh ? this.kanban.move(card.id, { to: "running" }, "system", now) : this.kanban.get(card.id);
                    if (current.phase !== "running") return undefined;
                    this.kanban.hold(card.id, null);
                    return { card: current, base, branch, fresh, run: this.runs.start(card.id, branch, now) };
                })
                .immediate();
        } catch (error) {
            if (!(error instanceof KanbanError)) throw error;
            if (this.kanban.get(card.id).phase === card.phase) this.kanban.hold(card.id, error.message, now + retryAfterMs);
            return undefined;
        }
    }

    async execute({ card, base, branch, run: first, fresh }: Claim): Promise<void> {
        const folder = card.folder!;
        const switched = await checkout(folder, branch, base);
        if (!switched.ok) {
            this.runs.finish(first.id, "failed", switched.err);
            this.kanban.move(card.id, { to: "blocked", note: `Could not check out ${branch}: ${switched.err}` }, "system");
            return;
        }
        let run = first;
        let session = fresh ? undefined : (card.sessionId ?? undefined);
        let prompt = fresh || !session ? this.brief(card) : this.resumePrompt(card);
        let outcome: Outcome;
        for (;;) {
            outcome = await this.implement(card, run, branch, prompt, session);
            this.runs.finish(run.id, outcome.status, outcome.error ?? null);
            session = outcome.session ?? session;
            if (outcome.status !== "failed" || this.runs.failures(card.id) > card.retries) break;
            this.kanban.note(card.id, `Attempt ${run.attempt} failed: ${outcome.error}. Retrying.`, "system");
            run = this.runs.start(card.id, branch);
            prompt = session ? `The previous attempt stopped with an error: ${outcome.error}\n\nContinue the task from where it stopped.` : this.brief(card);
        }
        const saved = await commit(folder, outcome.status === "done" ? `card #${card.id}: ${card.title}` : `card #${card.id}: work in progress (${outcome.status})`);
        if (saved.error) {
            this.kanban.move(card.id, { to: "blocked", note: `Could not commit on ${branch}: ${clip(saved.error, 600)}` }, "system");
            return;
        }
        await git(folder, "switch", base);
        const committed = saved.sha ? `Committed ${saved.sha} on ${branch}.` : "Nothing to commit.";
        if (outcome.status === "done") {
            if (outcome.summary) this.kanban.note(card.id, clip(outcome.summary), "agent");
            this.kanban.move(card.id, { to: "archived", note: committed }, "system");
        }
        if (outcome.status === "blocked") this.kanban.move(card.id, { to: "blocked", note: `${outcome.question} (${committed})` }, "agent");
        if (outcome.status === "stopped") this.kanban.move(card.id, { to: "blocked", note: `Stopped by you. ${committed}` }, "system");
        if (outcome.status === "failed") {
            const attempts = this.runs.failures(card.id);
            this.kanban.move(card.id, { to: "blocked", note: `Failed after ${attempts} attempt${attempts > 1 ? "s" : ""}: ${outcome.error} ${committed}` }, "system");
        }
    }

    /*
     * Ready cards that just reached Review get their auditor. An auditor that cannot run (another harness, no
     * claude, retries spent, no verdict) never gets a verdict invented for it: the reason is held on the card and
     * written in the thread, the human is told, and they can retry the audit or reject the card.
     */
    async audits(now = Date.now()): Promise<Audit[]> {
        const audits: Audit[] = [];
        for (const card of this.kanban.list()) {
            if (card.phase !== "review" || card.route !== "ready" || card.auditorVerdict || card.held) continue;
            if (this.runs.list(card.id, now).some((run) => run.kind === "audit" && run.live)) continue;
            const refusal =
                card.auditor.harness !== "claude-code"
                    ? `${card.auditor.harness ?? "This harness"} cannot audit headless yet; audits use claude-code`
                    : !this.claude
                      ? "claude was not found on PATH"
                      : !card.folder
                        ? "The card has no folder"
                        : undefined;
            const base = refusal ? undefined : await resolveBase(card.folder!, card.baseBranch);
            const reason = refusal ?? (base && "held" in base ? base.held : undefined);
            if (reason || !base || !("base" in base)) {
                this.unable(card, reason ?? "no base branch");
                continue;
            }
            const branch = branchFor(card.id, card.title);
            audits.push({ card, base: base.base, branch, run: this.runs.start(card.id, branch, now, "audit") });
        }
        return audits;
    }

    async audit({ card, base, branch, run: first }: Audit): Promise<void> {
        const summary =
            this.kanban
                .events(card.id)
                .filter((event) => event.kind === "moved" && event.to === "review")
                .at(-1)?.text ?? "";
        let run = first;
        for (;;) {
            const session = crypto.randomUUID();
            this.runs.setSession(run.id, session);
            const outcome = await this.launch({
                card,
                run,
                header: `Audit ${run.attempt} of ${branch} against ${base}`,
                prompt: auditPrompt(card, summary, base, branch),
                args: auditorArgs(card, { id: session, resume: false }),
            });
            const verdict = outcome.status === "done" ? lastLine(outcome.summary ?? "", /^\s*VERDICT:\s*(PASS|FAIL)\b[\s:-]*(.*)$/gim) : undefined;
            if (verdict) {
                this.runs.finish(run.id, "done", null);
                const ok = verdict[1]!.toUpperCase() === "PASS";
                const reason = verdict[2]?.trim() || clip(outcome.summary ?? "", 600);
                this.kanban.verdict(card.id, "auditor", ok, reason);
                this.desktop.notify(`Card #${card.id} · Auditor ${ok ? "✓" : "✗"}`, [card.title, clip(reason, 200)]);
                return;
            }
            const error = outcome.status === "done" ? "The auditor gave no VERDICT line" : (outcome.error ?? `The audit ended as ${outcome.status}`);
            this.runs.finish(run.id, "failed", error);
            if (this.runs.failures(card.id, "audit") > card.retries) {
                this.unable(card, error);
                return;
            }
            run = this.runs.start(card.id, branch, Date.now(), "audit");
        }
    }

    private unable(card: Card, reason: string) {
        this.kanban.hold(card.id, `Could not audit: ${reason}`);
        this.kanban.note(card.id, `The audit could not run: ${reason}. Retry it from the card, or reject the card and send it back.`, "system");
        this.desktop.notify(`Card #${card.id} · The audit could not run`, [card.title, clip(reason, 200)]);
    }

    private brief(card: Card): string {
        const files = card.files.map((file) => `- ${file.name}`).join("\n");
        return [card.brief.trim(), files && `Attached files:\n${files}`].filter(Boolean).join("\n\n");
    }

    private resumePrompt(card: Card): string {
        const entry = this.kanban
            .events(card.id)
            .filter((event) => event.kind === "moved" && event.to === "running")
            .at(-1);
        if (entry?.actor === "human" && entry.text) return `The human answered: ${entry.text}\n\nContinue the task.`;
        return "The previous run was interrupted. Continue the task from where it stopped.";
    }

    private async implement(card: Card, run: Run, branch: string, prompt: string, session: string | undefined): Promise<Outcome> {
        const files = join(this.kanban.filesDir, String(card.id));
        const id = session ?? crypto.randomUUID();
        this.runs.setSession(run.id, id);
        const outcome = await this.launch({
            card,
            run,
            header: `Attempt ${run.attempt} on ${branch}`,
            prompt,
            args: implementerArgs(card, { id, resume: Boolean(session) }, systemPrompt(card, branch, files), card.files.length > 0 ? [files] : []),
            onInit: session ? undefined : () => this.kanban.setSession(card.id, id),
        });
        const resumable = session !== undefined || outcome.started ? id : undefined;
        if (outcome.status !== "done") return { ...outcome, session: resumable };
        const question = lastLine(outcome.summary ?? "", /^\s*BLOCKED:\s*(.+)$/gim)?.[1]?.trim();
        return { ...outcome, session: resumable, ...(question ? { status: "blocked", question } : {}) };
    }

    private async launch({ card, run, args, prompt, header, onInit }: Launch): Promise<Outcome> {
        const log = this.runs.logPath(run);
        mkdirSync(dirname(log), { recursive: true });
        const write = (line: string) => appendFileSync(log, `${line}\n`);
        write(JSON.stringify({ type: "aspis", text: header }));
        write(JSON.stringify({ type: "aspis", kind: "prompt", text: prompt }));
        const proc = Bun.spawn([...this.claude!, ...args], {
            cwd: card.folder!,
            stdin: new TextEncoder().encode(prompt),
            stdout: "pipe",
            stderr: "pipe",
            windowsHide: true,
        });
        this.runs.attach(run.id, proc.pid);
        let stopped = false;
        let timedOut = false;
        let started = false;
        let lastBeat = Date.now();
        const watch = setInterval(() => {
            if (Date.now() - lastBeat >= this.heartbeatMs) {
                lastBeat = Date.now();
                this.runs.beat(run.id, lastBeat);
            }
            if (!stopped && this.runs.stopRequested(run.id)) {
                stopped = true;
                killTree(proc.pid);
            }
        }, this.pollMs);
        const limit = card.timeLimitMin
            ? setTimeout(() => {
                  timedOut = true;
                  killTree(proc.pid);
              }, card.timeLimitMin * 60_000)
            : undefined;
        const stderr = new Response(proc.stderr).text();
        let result: Record<string, any> | undefined;
        for await (const line of lines(proc.stdout)) {
            if (!line) continue;
            write(line);
            const event = parse(line);
            if (!started && event?.type === "system" && event.subtype === "init") {
                started = true;
                onInit?.();
            }
            if (event?.type === "result") result = event;
        }
        const code = await proc.exited;
        clearInterval(watch);
        clearTimeout(limit);
        if (stopped) return { status: "stopped", started };
        if (timedOut) return { status: "failed", started, error: `Time limit of ${card.timeLimitMin} min reached` };
        if (code === 0 && result && !result.is_error) return { status: "done", started, summary: String(result.result ?? "").trim() };
        const errors = (await stderr).trim().split("\n").filter(Boolean);
        const error = (result?.is_error && String(result.result ?? "")) || errors.at(-1) || `claude exited with code ${code}`;
        write(JSON.stringify({ type: "aspis", text: `${header} failed: ${error}` }));
        return { status: "failed", started, error: clip(error, 600) };
    }
}
