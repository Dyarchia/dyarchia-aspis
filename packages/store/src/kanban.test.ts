import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Kanban, Store } from "./index.ts";

const runner = { harness: "claude-code", model: "claude-opus-5-5", effort: "high" };
const now = new Date(2026, 9, 13, 9, 0).getTime();

let dir: string;
let store: Store;
let kanban: Kanban;
let board: number;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aspis-kanban-"));
    store = new Store(join(dir, "state.db"));
    kanban = new Kanban(store);
    board = kanban.createBoard({ name: "Repo", folder: join(dir, "repo") }).id;
});

afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
});

const prepared = (title = "Refactor the trigger handler") => {
    const card = kanban.create(title, board, now);
    return kanban.edit(card.id, { brief: "Move the pricing rules", implementer: runner, auditor: runner, scheduledAt: now - 1 }, "human", now);
};

describe("kanban service", () => {
    test("a new card starts in triage, works in its board's folder and inherits the runners of the board's last card", () => {
        const first = prepared();
        expect(first.phase).toBe("triage");
        const second = kanban.create("Write callout tests", board, now);
        expect(second.implementer).toEqual(runner);
        expect(second.folder).toBe(join(dir, "repo"));
        expect(second.board).toBe(board);
        expect(second.brief).toBe("");
        expect(kanban.events(second.id).map((event) => event.kind)).toEqual(["created"]);
    });

    test("the ready route runs end to end through the rules", () => {
        const { id } = prepared();
        kanban.move(id, { to: "ready" }, "human", now);
        expect(() => kanban.move(id, { to: "running", sessionId: "s-1" }, "human", now)).toThrow("Only the agent");
        kanban.move(id, { to: "running", sessionId: "s-1" }, "agent", now);
        expect(() => kanban.edit(id, { title: "x" }, "human", now)).toThrow("cannot be edited");
        kanban.move(id, { to: "blocked", note: "Which org?" }, "agent", now);
        kanban.move(id, { to: "running", note: "Use UAT" }, "human", now);
        kanban.move(id, { to: "review", note: "Selector class in place" }, "agent", now);
        expect(() => kanban.verdict(id, "human", true, "Looks right", now)).toThrow("auditor speaks first");
        kanban.verdict(id, "auditor", true, "Tests pass", now);
        expect(() => kanban.move(id, { to: "done" }, "human", now)).toThrow("Your check");
        kanban.verdict(id, "human", true, "Approved", now);
        kanban.move(id, { to: "done" }, "human", now);
        const archived = kanban.move(id, { to: "archived" }, "human", now);
        expect(archived).toMatchObject({ phase: "archived", route: "ready", sessionId: "s-1", blockedReason: null });
        expect(kanban.events(id).filter((event) => event.kind === "moved").map((event) => event.to)).toEqual([
            "ready",
            "running",
            "blocked",
            "running",
            "review",
            "done",
            "archived",
        ]);
    });

    test("a rejection keeps its reason in the thread and clears both checks", () => {
        const { id } = prepared();
        kanban.move(id, { to: "ready" }, "human", now);
        kanban.move(id, { to: "running", sessionId: "s-1" }, "agent", now);
        kanban.move(id, { to: "review", note: "Done" }, "agent", now);
        kanban.verdict(id, "auditor", false, "No tests", now);
        expect(() => kanban.move(id, { to: "done" }, "human", now)).toThrow("not approved");
        const back = kanban.move(id, { to: "running", note: "Add the tests" }, "human", now);
        expect(back).toMatchObject({ phase: "running", auditorVerdict: null, humanVerdict: null });
        expect(kanban.events(id).map((event) => event.text)).toContain("Add the tests");
    });

    test("a recurring scheduled card archives itself and leaves the next run scheduled", () => {
        const { id } = prepared();
        kanban.edit(id, { recurrence: "daily", scheduledAt: now }, "human", now);
        kanban.move(id, { to: "scheduled" }, "human", now);
        kanban.move(id, { to: "running" }, "system", now);
        kanban.move(id, { to: "archived" }, "system", now);
        const next = kanban.list().find((card) => card.id !== id)!;
        expect(next).toMatchObject({ phase: "scheduled", recurrence: "daily", title: "Refactor the trigger handler" });
        expect(next.scheduledAt).toBe(new Date(2026, 9, 14, 9, 0).getTime());
        expect(kanban.events(next.id)[0]?.text).toBe(`Next run of #${id}`);
    });

    test("dependencies hold a card and refuse cycles", () => {
        const first = prepared("First");
        const second = prepared("Second");
        kanban.edit(second.id, { dependsOn: [first.id] }, "human", now);
        expect(() => kanban.edit(first.id, { dependsOn: [second.id] }, "human", now)).toThrow("cycle");
        expect(() => kanban.edit(first.id, { dependsOn: [first.id] }, "human", now)).toThrow("itself");
        kanban.move(second.id, { to: "scheduled" }, "human", now);
        expect(() => kanban.move(second.id, { to: "running" }, "system", now)).toThrow("dependency");
    });

    test("files live next to state.db and only change while you own the card", () => {
        const { id } = prepared();
        const withFile = kanban.addFile(id, "spec.md", new TextEncoder().encode("# Spec"), now);
        const [file] = withFile.files;
        const { path } = kanban.file(id, file!.id);
        expect(readFileSync(path, "utf8")).toBe("# Spec");
        kanban.move(id, { to: "ready" }, "human", now);
        kanban.move(id, { to: "running", sessionId: "s" }, "agent", now);
        expect(() => kanban.removeFile(id, file!.id, now)).toThrow("cannot change");
        expect(existsSync(path)).toBe(true);
    });

    test("notes follow who owns the card", () => {
        const { id } = prepared();
        expect(kanban.note(id, "Check the org first", "human", now).actor).toBe("human");
        expect(() => kanban.note(id, "Hello", "agent", now)).toThrow("cannot write");
        expect(() => kanban.note(id, "  ", "human", now)).toThrow("empty");
    });

    test("only triage cards can be deleted", () => {
        const { id } = prepared();
        kanban.move(id, { to: "ready" }, "human", now);
        expect(() => kanban.remove(id)).toThrow("Only cards in Triage");
        kanban.move(id, { to: "triage" }, "human", now);
        kanban.remove(id);
        expect(kanban.list()).toEqual([]);
    });
});
