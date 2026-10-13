import type { Card, Run, RunStatus } from "@dyarchia/core";
import { Kanban, KanbanError, Runs, type Store } from "@dyarchia/store";
import { appendFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { claudeArgs, claudeCommand, systemPrompt } from "./claude.ts";
import { branchFor, checkout, commit, git, readiness } from "./git.ts";

export interface DispatcherOptions {
    store: Store;
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

interface Outcome {
    status: Exclude<RunStatus, "running">;
    session?: string;
    error?: string;
    summary?: string;
    question?: string;
}

const clip = (text: string, length = 4000) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

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
 * Runs the Scheduled route end to end. claim() finds what is due (and running cards a human unblocked or a dead
 * runner left behind), holds what cannot start yet with the reason, and moves the rest to Running as the system,
 * one per repository. execute() checks out the card branch, drives the harness with retries, commits what it
 * left, returns the repository to its base branch and moves the card to Archived or Blocked.
 */
export class Dispatcher {
    readonly kanban: Kanban;
    readonly runs: Runs;
    private readonly pollMs: number;
    private readonly heartbeatMs: number;

    constructor(private readonly options: DispatcherOptions) {
        this.kanban = new Kanban(options.store);
        this.runs = new Runs(options.store);
        this.pollMs = options.pollMs ?? 1000;
        this.heartbeatMs = options.heartbeatMs ?? 10_000;
    }

    private get claude() {
        return this.options.claude ?? claudeCommand();
    }

    async dispatch(): Promise<number[]> {
        const claims = await this.claim();
        await Promise.all(claims.map((claim) => this.execute(claim)));
        return claims.map((claim) => claim.card.id);
    }

    async claim(now = Date.now()): Promise<Claim[]> {
        this.runs.reap(now);
        this.options.store.setMeta("dispatch.last", String(now));
        const cards = this.kanban.list();
        const orphans = cards.filter((card) => card.phase === "running" && card.route === "scheduled" && !this.runs.live(card.id, now));
        const due = cards
            .filter((card) => card.phase === "scheduled" && card.scheduledAt !== null && card.scheduledAt <= now)
            .sort((a, b) => b.priority - a.priority || a.scheduledAt! - b.scheduledAt!);
        const taken = new Set<string>();
        const claims: Claim[] = [];
        for (const card of [...orphans, ...due]) {
            const ready = await this.check(card, taken, now);
            if ("held" in ready) {
                this.kanban.hold(card.id, ready.held);
                continue;
            }
            const claim = this.take(card, ready.base, now);
            if (!claim) continue;
            taken.add(card.folder!);
            claims.push(claim);
        }
        return claims;
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
            this.kanban.hold(card.id, error.message);
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
            outcome = await this.attempt(card, run, branch, prompt, session);
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

    private async attempt(card: Card, run: Run, branch: string, prompt: string, session: string | undefined): Promise<Outcome> {
        const log = this.runs.logPath(run);
        mkdirSync(dirname(log), { recursive: true });
        const write = (line: string) => appendFileSync(log, `${line}\n`);
        write(JSON.stringify({ type: "aspis", text: `Attempt ${run.attempt} on ${branch}` }));
        write(JSON.stringify({ type: "aspis", kind: "prompt", text: prompt }));
        const files = join(this.kanban.filesDir, String(card.id));
        const id = session ?? crypto.randomUUID();
        const proc = Bun.spawn([...this.claude!, ...claudeArgs(card, { id, resume: Boolean(session) }, systemPrompt(card, branch, files), card.files.length > 0 ? [files] : [])], {
            cwd: card.folder!,
            stdin: new TextEncoder().encode(prompt),
            stdout: "pipe",
            stderr: "pipe",
            windowsHide: true,
        });
        this.runs.attach(run.id, proc.pid);
        let stopped = false;
        let timedOut = false;
        let started = Boolean(session);
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
                this.kanban.setSession(card.id, id);
            }
            if (event?.type === "result") result = event;
        }
        const code = await proc.exited;
        clearInterval(watch);
        clearTimeout(limit);
        const sessionId = started ? id : undefined;
        if (stopped) return { status: "stopped", session: sessionId };
        if (timedOut) return { status: "failed", session: sessionId, error: `Time limit of ${card.timeLimitMin} min reached` };
        if (code === 0 && result && !result.is_error) {
            const summary = String(result.result ?? "").trim();
            const question = [...summary.matchAll(/^\s*BLOCKED:\s*(.+)$/gim)].at(-1)?.[1]?.trim();
            return question ? { status: "blocked", session: sessionId, summary, question } : { status: "done", session: sessionId, summary };
        }
        const errors = (await stderr).trim().split("\n").filter(Boolean);
        const error = (result?.is_error && String(result.result ?? "")) || errors.at(-1) || `claude exited with code ${code}`;
        write(JSON.stringify({ type: "aspis", text: `Attempt ${run.attempt} failed: ${error}` }));
        return { status: "failed", session: sessionId, error: clip(error, 600) };
    }
}
