import { type Card, type CardEvent, phaseLabels, worktreePath } from "@dyarchia/core";
import { Kanban, KanbanError, Runs, type Store } from "@dyarchia/store";
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Desktop } from "./desktop.ts";
import { branchFor, checkout, commit, git, readiness, release } from "./git.ts";

/*
 * The CLIs that can hold a Ready card. Each one needs its wiring in agents.ts (where its settings live and how its
 * hooks and MCP server are written) and its reply format in replies below; nothing else knows a CLI by name.
 */
export const hookHarnesses = ["claude-code"] as const;
export type HookHarness = (typeof hookHarnesses)[number];

interface Replies {
    context(event: "UserPromptSubmit" | "PreToolUse", text: string): HookReply;
    deny(reason: string): HookReply;
    stop(reason: string): HookReply;
}

const replies: Record<HookHarness, Replies> = {
    "claude-code": {
        context: (event, text) => ({ exit: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }) }),
        deny: (reason) => ({ exit: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }) }),
        stop: (reason) => ({ exit: 0, stdout: JSON.stringify({ decision: "block", reason }) }),
    },
};

export interface HookEvent {
    hook_event_name?: string;
    session_id?: string;
    cwd?: string;
    prompt?: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    stop_hook_active?: boolean;
    last_assistant_message?: string;
}

export interface HookReply {
    exit: number;
    stdout?: string;
    stderr?: string;
}

const allow: HookReply = { exit: 0 };
const pickupCommand = /(^|\s)\/?(skill:)?dya-pickup\b/i;
const aspisTool = /aspis.*card_(get|note|block|deliver)$/;

/*
 * Talking is not touching: while the card waits on the human (Blocked, Review) the agent may still read and answer
 * questions, so these tools pass. Anything that can change the repository or run commands stays stopped.
 */
const readOnly = new Set([
    "Read",
    "Grep",
    "Glob",
    "LS",
    "ReadMediaFile",
    "NotebookRead",
    "WebSearch",
    "WebFetch",
    "FetchURL",
    "ToolSearch",
    "TodoWrite",
    "TodoList",
    "TaskList",
    "TaskGet",
    "TaskOutput",
    "AskUserQuestion",
    "ListMcpResourcesTool",
    "ReadMcpResourceTool",
]);
const comparable = (path: string) => resolve(path).replace(/[\\/]+$/, "").toLowerCase();
const clip = (text: string, length = 140) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

const toolSummary = (input: Record<string, unknown> = {}) => {
    const value = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.description ?? input.summary ?? input.text;
    return clip(typeof value === "string" ? value.replace(/\s+/g, " ") : JSON.stringify(input));
};

function messageText(events: readonly CardEvent[]) {
    const lines = events.map((event) => (event.kind === "moved" ? `- (moved the card to ${phaseLabels[event.to!]}) ${event.text}` : `- ${event.text}`));
    return `[Aspis] Message from the human who owns card #${events[0]!.cardId}:\n${lines.join("\n")}`;
}

/*
 * The Ready route, driven from the human's own CLI session. The CLI's hooks call hook() with the event they
 * received: the prompt that contains dya-pickup claims the best Ready card for that folder and harness, every tool
 * call goes through the guard (which stops a session whose card waits on the human, keeps a session on its own
 * card, records the call and hands over what the human wrote), and the end of a turn hands over anything still
 * pending. The agent itself answers through the MCP tools: note, block and deliver.
 *
 * A session that holds a card has a marker file named after it. The desktop exe checks for it before starting
 * this process at all, so the sessions that hold nothing (nearly all of them) pay no more than a file lookup.
 */
export class Ready {
    readonly kanban: Kanban;
    readonly runs: Runs;
    readonly sessions: string;
    readonly desktop: Desktop;

    constructor(store: Store, desktop?: Desktop) {
        this.kanban = new Kanban(store);
        this.runs = new Runs(store);
        this.sessions = join(dirname(store.path), "sessions");
        this.desktop = desktop ?? new Desktop({ store });
    }

    private marker(session: string) {
        return join(this.sessions, session.replace(/[^A-Za-z0-9_-]/g, "_"));
    }

    async hook(event: HookEvent, harness: HookHarness): Promise<HookReply> {
        const session = event.session_id;
        if (!session) return allow;
        if (event.hook_event_name === "UserPromptSubmit") {
            if (pickupCommand.test(event.prompt ?? "")) return this.context(harness, "UserPromptSubmit", await this.pickup(event.cwd ?? process.cwd(), harness, session));
            const card = this.kanban.bySession(session);
            if (!card || card.phase !== "running") return allow;
            this.record(card, { type: "aspis", kind: "prompt", text: event.prompt ?? "" });
            const pending = this.take(card);
            return pending ? this.context(harness, "UserPromptSubmit", pending) : allow;
        }
        if (event.hook_event_name === "PreToolUse") return this.guard(event, harness, session);
        if (event.hook_event_name === "Stop") {
            const card = this.kanban.bySession(session);
            if (!card || card.phase !== "running") return allow;
            if (event.last_assistant_message) this.record(card, { type: "aspis", kind: "answer", text: event.last_assistant_message });
            if (event.stop_hook_active) return allow;
            const pending = this.take(card);
            if (!pending) return allow;
            return replies[harness].stop(pending);
        }
        return allow;
    }

    async pickup(cwd: string, harness: string, sessionId: string, now = Date.now()): Promise<string> {
        const held = this.kanban.bySession(sessionId);
        if (held && held.phase === "running") return this.briefing(held, "You already hold this card.");
        const candidates = this.kanban
            .list()
            .filter((card) => card.phase === "ready" && card.implementer.harness === harness && card.folder && comparable(card.folder) === comparable(cwd))
            .sort((a, b) => b.priority - a.priority || a.id - b.id);
        if (candidates.length === 0) return `[Aspis] No card was picked up: there is no Ready card for ${harness} in ${cwd}. Tell the user and stop; do not look for work yourself.`;
        const reasons: string[] = [];
        for (const card of candidates) {
            const blocker = this.kanban.targets(card.id, "agent", now).find((target) => target.to === "running")?.reason;
            if (blocker) {
                reasons.push(`#${card.id}: ${blocker}`);
                continue;
            }
            const branch = branchFor(card.id, card.title);
            if (this.runs.busy(card.folder!)) return this.refusal(`another card is running in ${basename(card.folder!)}`);
            const freed = await release(card.folder!, worktreePath(card.folder!, card.id));
            if (freed.error) return this.refusal(freed.error);
            const ready = await readiness(card.folder!, card.baseBranch, branch);
            if ("held" in ready) return this.refusal(ready.held);
            const switched = await checkout(card.folder!, branch, ready.base);
            if (!switched.ok) return this.refusal(`could not check out ${branch}: ${switched.err}`);
            try {
                this.kanban.move(card.id, { to: "running", sessionId }, "agent", now);
            } catch (error) {
                if (!(error instanceof KanbanError)) throw error;
                reasons.push(`#${card.id}: ${error.message}`);
                continue;
            }
            const taken = this.kanban.get(card.id);
            mkdirSync(this.sessions, { recursive: true });
            writeFileSync(this.marker(sessionId), String(card.id));
            const run = this.runs.start(card.id, branch, now, "interactive", sessionId);
            this.record(taken, { type: "aspis", text: `Picked up by ${harness} session ${sessionId} on ${branch}` }, run.id);
            const history = this.kanban.events(card.id).filter((event) => event.actor === "human" && event.text && event.kind === "note");
            this.kanban.markDelivered(card.id, Math.max(0, ...this.kanban.events(card.id).map((event) => event.id)));
            return this.briefing(taken, history.length > 0 ? `Notes from the human so far:\n${history.map((event) => `- ${event.text}`).join("\n")}` : "", ready.base);
        }
        return this.refusal(`every Ready card here is waiting: ${reasons.join("; ")}`);
    }

    private refusal(reason: string) {
        return `[Aspis] No card was picked up: ${reason}. Tell the user and stop; do not look for work yourself.`;
    }

    private briefing(card: Card, extra: string, base?: string) {
        const branch = branchFor(card.id, card.title);
        const files = join(this.kanban.filesDir, String(card.id));
        return [
            `[Aspis] You picked up card #${card.id} "${card.title}" from the Dyarchia Aspis kanban. It is yours until you deliver it or block it.`,
            `Brief:\n${card.brief.trim()}`,
            card.files.length > 0 ? `Attached files, in ${files}: ${card.files.map((file) => file.name).join(", ")}` : "",
            extra,
            [
                "How this card works:",
                `- You are on the branch ${branch} in ${card.folder}${base ? `, made from ${base}` : ""}. Stay on it; do not push or open pull requests.`,
                `- When the work is done, call the aspis MCP tool card_deliver with card ${card.id} and a summary of what you did. Your changes are committed on the branch for you and the card goes to Review, where an auditor and then the human check it.`,
                `- If you cannot continue without the human, call card_block with card ${card.id} and your question, then stop and wait for the answer.`,
                `- card_note with card ${card.id} leaves a note in the card thread; card_get shows the card again.`,
                '- The human who owns the card may write to you while you work. Their messages reach you as extra context or as a tool denial starting with "[Aspis] Message from the human". Treat them as instructions from your user.',
            ].join("\n"),
        ]
            .filter(Boolean)
            .join("\n\n");
    }

    private context(harness: HookHarness, event: "UserPromptSubmit" | "PreToolUse", text: string): HookReply {
        return replies[harness].context(event, text);
    }

    private deny(reason: string, harness: HookHarness): HookReply {
        return replies[harness].deny(reason);
    }

    private guard(event: HookEvent, harness: HookHarness, session: string): HookReply {
        const tool = event.tool_name ?? "";
        const own = aspisTool.test(tool);
        const card = this.kanban.bySession(session);
        if (!card || !["running", "blocked", "review"].includes(card.phase)) rmSync(this.marker(session), { force: true });
        if (!card) return own ? this.deny("[Aspis] This session holds no card. Ask the human to run dya-pickup in this folder.", harness) : allow;
        const target = Number(event.tool_input?.card);
        if (own && target !== card.id) return this.deny(`[Aspis] This session holds card #${card.id}; it cannot act on card #${event.tool_input?.card}.`, harness);
        const noting = (own && /card_(note|get)$/.test(tool)) || readOnly.has(tool);
        if (card.phase === "blocked" && !noting) return this.deny(`[Aspis] Card #${card.id} is Blocked: ${card.blockedReason ?? "waiting for the human"}. Stop and wait; the human answers in the thread and resumes this session.`, harness);
        if (card.phase === "review" && !noting) return this.deny(`[Aspis] Card #${card.id} is in Review. Do not change anything until the human sends it back.`, harness);
        if (card.phase !== "running") return allow;
        this.record(card, { type: "aspis-tool", name: tool, text: toolSummary(event.tool_input) });
        const pending = this.take(card);
        return pending ? this.context(harness, "PreToolUse", pending) : allow;
    }

    private take(card: Card): string | undefined {
        const pending = this.kanban.pending(card.id);
        if (pending.length === 0) return undefined;
        this.kanban.markDelivered(card.id, pending.at(-1)!.id);
        return messageText(pending);
    }

    private record(card: Card, line: Record<string, unknown>, runId?: number) {
        const run = runId ? this.runs.get(runId) : (this.runs.session(card.id) ?? this.runs.start(card.id, branchFor(card.id, card.title), Date.now(), "interactive", card.sessionId));
        const path = this.runs.logPath(run);
        mkdirSync(dirname(path), { recursive: true });
        appendFileSync(path, `${JSON.stringify(line)}\n`);
        this.runs.beat(run.id);
    }

    get(id: number): string {
        const card = this.kanban.get(id);
        return this.briefing(card, `Phase: ${phaseLabels[card.phase]}`);
    }

    note(id: number, text: string): string {
        this.kanban.note(id, text, "agent");
        return `Noted on card #${id}.`;
    }

    block(id: number, question: string): string {
        this.kanban.move(id, { to: "blocked", note: question }, "agent");
        this.finish(id, "blocked");
        return `Card #${id} is Blocked. Stop now and wait: the human answers in the thread and resumes this session.`;
    }

    async deliver(id: number, summary: string): Promise<string> {
        const card = this.kanban.get(id);
        if (card.phase !== "running" || card.route !== "ready") throw new KanbanError(`Card #${id} is not running on the Ready route`, 409);
        const branch = branchFor(card.id, card.title);
        const current = (await git(card.folder!, "branch", "--show-current")).out;
        if (current !== branch) throw new KanbanError(`The repository is on ${current || "a detached HEAD"}; switch back to ${branch} and deliver again`, 409);
        const saved = await commit(card.folder!, `card #${card.id}: ${card.title}`);
        if (saved.error) throw new KanbanError(`Could not commit on ${branch}: ${saved.error}`, 409);
        const committed = saved.sha ? `Committed ${saved.sha} on ${branch}.` : "Nothing new to commit.";
        this.kanban.move(id, { to: "review", note: `${summary.trim()}\n\n${committed}` }, "agent");
        this.finish(id, "done");
        this.desktop.kick();
        return `Card #${id} is in Review. ${committed} The auditor checks it next, then the human. Stop working on it unless the human sends it back.`;
    }

    private finish(id: number, status: "done" | "blocked") {
        const run = this.runs.session(id);
        if (run) this.runs.finish(run.id, status, null);
    }
}
