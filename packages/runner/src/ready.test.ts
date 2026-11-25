import { runLines } from "@dyarchia/core";
import { Store } from "@dyarchia/store";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Desktop } from "./desktop.ts";
import { Dispatcher } from "./dispatch.ts";
import { git } from "./git.ts";
import { Ready } from "./ready.ts";
import { fakeClaude, makeRepo, tempFolders } from "./testing.ts";

const claude = { harness: "claude-code", model: "claude-opus-5-5", effort: "high" };

const folder = tempFolders("aspis-ready-");

let dir: string;
let repo: string;
let store: Store;
let ready: Ready;
let kicks: number;

beforeEach(async () => {
    dir = folder();
    repo = join(dir, "repo");
    await makeRepo(repo);
    store = new Store(join(dir, "state.db"));
    kicks = 0;
    ready = new Ready(store, new Desktop({ store, launcher: undefined, kick: () => kicks++ }));
});

afterEach(() => store.close());

const kanban = () => ready.kanban;

function readyCard(title: string, extra: Record<string, unknown> = {}) {
    const board = kanban().boards()[0]?.id ?? kanban().createBoard({ name: "repo", folder: repo }).id;
    const card = kanban().create(title, board);
    kanban().edit(card.id, { brief: `Brief of ${title}`, implementer: claude, auditor: claude, retries: 0, ...extra }, "human");
    return kanban().move(card.id, { to: "ready" }, "human").id;
}

const prompt = (session: string, text: string) => ready.hook({ hook_event_name: "UserPromptSubmit", session_id: session, cwd: repo, prompt: text }, "claude-code");
const tool = (session: string, name: string, input: Record<string, unknown> = {}) =>
    ready.hook({ hook_event_name: "PreToolUse", session_id: session, cwd: repo, tool_name: name, tool_input: input }, "claude-code");
const context = (stdout = "") => JSON.parse(stdout).hookSpecificOutput;
const auditors = () => new Dispatcher({ store, claude: [process.execPath, fakeClaude], pollMs: 20 });

async function inReview(title: string, extra: Record<string, unknown> = {}) {
    const id = readyCard(title, extra);
    await prompt("s-1", "/dya-pickup");
    await ready.deliver(id, "Done");
    return id;
}

describe("the ready route", () => {
    test("dya-pickup claims the best Ready card for this folder and harness and puts the repository on its branch", async () => {
        readyCard("Low priority");
        const best = readyCard("Fix the trigger", { priority: 3 });
        readyCard("Codex job", { implementer: { ...claude, harness: "codex" } });
        kanban().note(best, "Mind the bulk path", "human");

        const reply = await prompt("s-1", "/dya-pickup");
        const text = context(reply.stdout).additionalContext as string;
        expect(text).toContain(`picked up card #${best} "Fix the trigger"`);
        expect(text).toContain("Brief of Fix the trigger");
        expect(text).toContain("Mind the bulk path");
        expect(kanban().get(best)).toMatchObject({ phase: "running", route: "ready", sessionId: "s-1" });
        expect(existsSync(join(ready.sessions, "s-1"))).toBe(true);
        expect((await git(repo, "branch", "--show-current")).out).toBe(`feature/develop/card-${best}-fix-the-trigger`);

        const other = await prompt("s-2", "please /dya-pickup");
        expect(context(other.stdout).additionalContext).toContain("another card is running in repo");
    });

    test("pickup refuses a dirty repository and a folder with nothing for this harness", async () => {
        readyCard("Anything");
        writeFileSync(join(repo, "scratch.txt"), "x");
        expect(context((await prompt("s-1", "/dya-pickup")).stdout).additionalContext).toContain("repo has uncommitted changes");
        expect(await ready.pickup(repo, "codex", "s-2")).toContain("there is no Ready card for codex");
    });

    test("a session without a card goes untouched, and a session only acts on its own card", async () => {
        expect(await tool("nobody", "Bash", { command: "ls" })).toEqual({ exit: 0 });
        expect(context((await tool("nobody", "mcp__aspis__card_note", { card: 1, text: "x" })).stdout).permissionDecision).toBe("deny");
        const id = readyCard("Mine");
        await prompt("s-1", "/dya-pickup");
        const foreign = await tool("s-1", "mcp__aspis__card_deliver", { card: id + 1, summary: "x" });
        expect(context(foreign.stdout).permissionDecisionReason).toContain(`holds card #${id}`);
        expect(await tool("s-1", "mcp__aspis__card_deliver", { card: id, summary: "x" })).toEqual({ exit: 0 });
    });

    test("what you write reaches the agent once, at its next tool call", async () => {
        const id = readyCard("Talk to me");
        await prompt("s-1", "/dya-pickup");
        kanban().note(id, "Use the UAT org", "human");
        const delivered = context((await tool("s-1", "Bash", { command: "git status" })).stdout);
        expect(delivered.additionalContext).toContain("Use the UAT org");
        expect(delivered.permissionDecision).toBeUndefined();
        expect(await tool("s-1", "Bash", { command: "git diff" })).toEqual({ exit: 0 });


        const log = runLines(readFileSync(ready.runs.logPath(ready.runs.session(id)!), "utf8"));
        expect(log).toContainEqual({ kind: "tool", text: "Bash git status" });
    });

    test("the end of a turn hands over what is pending, once, without looping", async () => {
        const id = readyCard("Stop hook");
        await prompt("s-1", "/dya-pickup");
        kanban().note(id, "One more thing", "human");
        const stop = { hook_event_name: "Stop", session_id: "s-1", cwd: repo, last_assistant_message: "Done for now" };
        expect(await ready.hook({ ...stop, stop_hook_active: true }, "claude-code")).toEqual({ exit: 0 });
        expect(JSON.parse((await ready.hook(stop, "claude-code")).stdout!)).toMatchObject({ decision: "block", reason: expect.stringContaining("One more thing") });
        expect(await ready.hook(stop, "claude-code")).toEqual({ exit: 0 });
    });

    test("blocking stops the session until you answer and resume it", async () => {
        const id = readyCard("Needs an answer");
        await prompt("s-1", "/dya-pickup");
        ready.block(id, "Which sandbox?");
        expect(kanban().get(id)).toMatchObject({ phase: "blocked", blockedReason: "Which sandbox?" });
        expect(context((await tool("s-1", "Edit")).stdout).permissionDecisionReason).toContain("is Blocked: Which sandbox?");
        kanban().move(id, { to: "running", note: "Use UAT" }, "human");
        const resumed = context((await prompt("s-1", "continue")).stdout).additionalContext;
        expect(resumed).toContain("(moved the card to Running) Use UAT");
        expect(await tool("s-1", "Edit")).toEqual({ exit: 0 });
    });

    test("delivering commits on the branch, the auditor judges it, and its session waits", async () => {
        const id = readyCard("Ship it");
        await prompt("s-1", "/dya-pickup");
        writeFileSync(join(repo, "done.md"), "work");
        expect(await ready.deliver(id, "Wrote done.md")).toContain("in Review");
        expect(kanban().get(id).phase).toBe("review");
        expect((await git(repo, "log", "-1", "--format=%s")).out).toBe(`card #${id}: Ship it`);
        expect(context((await tool("s-1", "Write")).stdout).permissionDecisionReason).toContain("is in Review");
        expect(await tool("s-1", "Read", { file_path: "done.md" })).toEqual({ exit: 0 });
        expect(kicks).toBe(1);

        const dispatcher = auditors();
        expect(await dispatcher.dispatch()).toEqual([id]);
        expect(kanban().get(id).auditorVerdict).toMatchObject({ ok: true, reason: "The branch does what the brief asks" });
        expect(await dispatcher.dispatch()).toEqual([]);
    });

    test("an auditor that fails leaves its failing verdict with the reason", async () => {
        const id = await inReview("Audit #audit-fail");
        await auditors().dispatch();
        expect(kanban().get(id).auditorVerdict).toMatchObject({ ok: false, reason: "The tests are missing" });
    });

    test("an auditor that forgets its verdict is retried, then the card is held with the reason and left alone", async () => {
        const dispatcher = auditors();
        const id = await inReview("Audit #audit-mute", { retries: 1 });
        await dispatcher.dispatch();
        expect(kanban().get(id)).toMatchObject({ auditorVerdict: null, held: "Could not audit: The auditor gave no VERDICT line" });
        expect(dispatcher.runs.list(id).filter((run) => run.kind === "audit")).toHaveLength(2);
        expect(kanban().events(id).at(-1)).toMatchObject({ actor: "system", text: expect.stringContaining("Retry it from the card") });
        expect(await dispatcher.dispatch()).toEqual([]);
    });

    test("an auditor that cannot run holds the card, and the human can still reject it", async () => {
        const id = await inReview("Audit by codex", { auditor: { ...claude, harness: "codex" } });
        await auditors().dispatch();
        expect(kanban().get(id).held).toContain("codex cannot audit headless yet");
        expect(() => kanban().verdict(id, "human", true, "Fine")).toThrow("Approving needs the auditor");
        kanban().verdict(id, "human", false, "Redo it with tests");
        expect(kanban().move(id, { to: "running", note: "Add tests" }, "human")).toMatchObject({ phase: "running", held: null });
    });

    test("an audit you retry runs again", async () => {
        const dispatcher = auditors();
        const id = await inReview("Retry me #audit-mute");
        await dispatcher.dispatch();
        expect(kanban().get(id).held).toContain("Could not audit");
        kanban().hold(id, null);
        expect(await dispatcher.dispatch()).toEqual([id]);
    }, 15_000);

    test("the session marker goes away once the card is no longer the agent's", async () => {
        const id = await inReview("Marked");
        kanban().verdict(id, "auditor", true, "Fine");
        kanban().verdict(id, "human", true, "Fine");
        kanban().move(id, { to: "done" }, "human");
        expect(await tool("s-1", "Bash")).toEqual({ exit: 0 });
        expect(existsSync(join(ready.sessions, "s-1"))).toBe(false);
    });

    test("an idle interactive session is never reaped", async () => {
        const id = readyCard("Long read");
        await prompt("s-1", "/dya-pickup");
        store.db.query("UPDATE runs SET heartbeat_at = 0").run();
        new Dispatcher({ store, claude: [process.execPath, fakeClaude] }).runs.reap();
        expect(ready.runs.session(id)?.live).toBe(true);
    });
});
