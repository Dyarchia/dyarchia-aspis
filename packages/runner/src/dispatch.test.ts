import { runLines } from "@dyarchia/core";
import { Store } from "@dyarchia/store";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Dispatcher } from "./dispatch.ts";
import { git } from "./git.ts";
import { fakeClaude, makeRepo, tempFolders } from "./testing.ts";

const runner = { harness: "claude-code", model: "claude-opus-5-5", effort: "high" };

const folder = tempFolders("aspis-runner-");

let dir: string;
let repo: string;
let store: Store;
let dispatcher: Dispatcher;

beforeEach(async () => {
    dir = folder();
    repo = join(dir, "repo");
    await makeRepo(repo);
    store = new Store(join(dir, "state.db"));
    dispatcher = new Dispatcher({ store, claude: [process.execPath, fakeClaude], pollMs: 20 });
});

afterEach(() => store.close());

const kanban = () => dispatcher.kanban;

function scheduled(title: string, brief: string, extra: Record<string, unknown> = {}) {
    const card = kanban().create(title);
    kanban().edit(card.id, { brief, implementer: runner, auditor: runner, folder: repo, scheduledAt: Date.now() - 1000, retries: 0, ...extra }, "human");
    return kanban().move(card.id, { to: "scheduled" }, "human").id;
}

const moves = (id: number) =>
    kanban()
        .events(id)
        .filter((event) => event.kind === "moved")
        .map((event) => `${event.actor}:${event.to}`);

const log = (id: number) =>
    dispatcher.runs
        .list(id)
        .reverse()
        .map((run) => dispatcher.runs.logPath(run))
        .filter((path) => existsSync(path))
        .map((path) => readFileSync(path, "utf8"))
        .join("");

describe("the scheduled route", () => {
    test("a due card runs on its branch, is committed and archived, and the repository returns to its base", async () => {
        const id = scheduled("Write the release note", "Summarise the sprint");
        expect(await dispatcher.dispatch()).toEqual([id]);
        const card = kanban().get(id);
        expect(card.phase).toBe("archived");
        expect(card.sessionId).toMatch(/^[0-9a-f-]{36}$/);
        expect(moves(id)).toEqual(["human:scheduled", "system:running", "system:archived"]);
        expect((await git(repo, "branch", "--show-current")).out).toBe("develop");
        expect((await git(repo, "status", "--porcelain")).out).toBe("");
        expect((await git(repo, "log", "-1", "--format=%s", `feature/develop/card-${id}-write-the-release-note`)).out).toBe(`card #${id}: Write the release note`);
        expect(kanban().events(id).find((event) => event.actor === "agent")?.text).toBe("Wrote the note.");
        expect(dispatcher.runs.list(id).map((run) => run.status)).toEqual(["done"]);
        const lines = runLines(log(id));
        expect(lines).toContainEqual({ kind: "prompt", text: "Summarise the sprint" });
        expect(lines).toContainEqual({ kind: "answer", text: "Writing the note." });
        expect(lines).toContainEqual({ kind: "tool", text: "Write note.md" });
    });

    test("a card waits with its reason while the repository is not ready", async () => {
        const id = scheduled("Dirty", "Anything");
        writeFileSync(join(repo, "scratch.txt"), "work in progress");
        expect(await dispatcher.dispatch()).toEqual([]);
        expect(kanban().get(id)).toMatchObject({ phase: "scheduled", held: "repo has uncommitted changes" });
        expect(kanban().get(id).wakeAt! - Date.now()).toBeGreaterThan(14 * 60_000);
        rmSync(join(repo, "scratch.txt"));
        await git(repo, "switch", "-q", "-c", "other");
        await dispatcher.dispatch();
        expect(kanban().get(id).held).toBe("repo is on other, not develop");
        await git(repo, "switch", "-q", "develop");
        expect(await dispatcher.dispatch()).toEqual([id]);
        expect(kanban().get(id)).toMatchObject({ phase: "archived", held: null, wakeAt: null });
    });

    test("when a card finishes, the next one waiting on its repository starts in the same dispatch", async () => {
        const first = scheduled("First in line", "Anything", { priority: 1 });
        const second = scheduled("Second in line", "Anything");
        expect(await dispatcher.dispatch()).toEqual([first, second]);
        expect(kanban().get(first).phase).toBe("archived");
        expect(kanban().get(second).phase).toBe("archived");
    });

    test("a run whose process is gone is failed at once and its card starts again", async () => {
        const id = scheduled("Killed by an update", "Anything", { retries: 1 });
        const [claim] = await dispatcher.claim();
        dispatcher.runs.attach(claim!.run.id, 999_999);
        expect(dispatcher.runs.reapDead((pid) => pid !== 999_999)).toBe(1);
        expect(await dispatcher.dispatch()).toEqual([id]);
        expect(dispatcher.runs.list(id).map((run) => run.status)).toEqual(["done", "failed"]);
    });

    test("every run keeps the session it can be resumed with", async () => {
        const id = scheduled("Resumable", "Anything");
        await dispatcher.dispatch();
        const [run] = dispatcher.runs.list(id);
        expect(run!.sessionId).toBe(kanban().get(id).sessionId);
    });

    test("only claude-code runs headless and future cards are left alone", async () => {
        const other = scheduled("Codex job", "Anything", { implementer: { ...runner, harness: "codex" } });
        const later = scheduled("Later", "Anything", { scheduledAt: Date.now() + 3_600_000 });
        expect(await dispatcher.dispatch()).toEqual([]);
        expect(kanban().get(other).held).toContain("cannot run headless yet");
        expect(kanban().get(later)).toMatchObject({ phase: "scheduled", held: null });
    });

    test("one card per repository at a time, the next waits for it", async () => {
        const first = scheduled("First", "Anything", { priority: 2 });
        const second = scheduled("Second", "Anything");
        const claims = await dispatcher.claim();
        expect(claims.map((claim) => claim.card.id)).toEqual([first]);
        expect(kanban().get(second).held).toBe("Another card is running in repo");
        await Promise.all(claims.map((claim) => dispatcher.execute(claim)));
        expect(await dispatcher.dispatch()).toEqual([second]);
    });

    test("the agent blocks with its question and resumes its session once you answer", async () => {
        const id = scheduled("Fix the flow", "Find the failing flow #block");
        await dispatcher.dispatch();
        expect(kanban().get(id)).toMatchObject({ phase: "blocked", blockedReason: "Which org has the failing flow? (Nothing to commit.)" });
        kanban().move(id, { to: "running", note: "UAT" }, "human");
        expect(await dispatcher.dispatch()).toEqual([id]);
        expect(kanban().get(id).phase).toBe("archived");
        const resumed = readFileSync(dispatcher.runs.logPath(dispatcher.runs.list(id)[0]!), "utf8");
        expect(resumed).toContain("The human answered: UAT");
        expect(resumed).toContain('"--resume"');
    });

    test("failures are retried in the same session and exhausted retries block the card", async () => {
        const flaky = scheduled("Flaky #fail-once", "Try", { retries: 2 });
        await dispatcher.dispatch();
        expect(dispatcher.runs.list(flaky).map((run) => run.status)).toEqual(["done", "failed"]);
        expect(kanban().get(flaky).phase).toBe("archived");

        const broken = scheduled("Broken #fail-always", "Try", { retries: 1 });
        await dispatcher.dispatch();
        expect(dispatcher.runs.list(broken).map((run) => run.status)).toEqual(["failed", "failed"]);
        expect(kanban().get(broken)).toMatchObject({ phase: "blocked", blockedReason: "Failed after 2 attempts: The API went away Nothing to commit." });
    });

    test("stop kills the harness and blocks the card with what it had", async () => {
        const id = scheduled("Long job", "Keep going #slow");
        const [claim] = await dispatcher.claim();
        const running = dispatcher.execute(claim!);
        const path = dispatcher.runs.logPath(claim!.run);
        while (!(existsSync(path) && readFileSync(path, "utf8").includes("Working"))) await Bun.sleep(20);
        expect(dispatcher.runs.requestStop(id)).toBe(true);
        await running;
        expect(kanban().get(id)).toMatchObject({ phase: "blocked", blockedReason: "Stopped by you. Nothing to commit." });
        expect(dispatcher.runs.list(id)[0]?.status).toBe("stopped");
    }, 20_000);

    test("a recurring card archives its run and schedules the next one", async () => {
        const id = scheduled("Nightly audit", "Audit", { recurrence: "daily" });
        await dispatcher.dispatch();
        const next = kanban()
            .list()
            .find((card) => card.id !== id)!;
        expect(next).toMatchObject({ phase: "scheduled", recurrence: "daily" });
        expect(next.scheduledAt!).toBeGreaterThan(Date.now());
    });

    test("a run whose runner died is failed and picked up again on the branch it left", async () => {
        const id = scheduled("Crashed", "Anything", { retries: 1 });
        const [claim] = await dispatcher.claim();
        await git(repo, "switch", "-q", "-c", claim!.branch);
        writeFileSync(join(repo, "half.md"), "half done");
        store.db.query("UPDATE runs SET heartbeat_at = 0 WHERE id = ?").run(claim!.run.id);
        kanban().setSession(id, crypto.randomUUID());
        expect(await dispatcher.dispatch()).toEqual([id]);
        expect(dispatcher.runs.list(id).map((run) => run.status)).toEqual(["done", "failed"]);
        expect(log(id)).toContain("The previous run was interrupted");
        expect((await git(repo, "show", "--stat", "--format=", claim!.branch)).out).toContain("half.md");
        expect((await git(repo, "branch", "--show-current")).out).toBe("develop");
    });
});
