import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Kanban, Store, migrations } from "./index.ts";

const dirs: string[] = [];
const tempDb = () => {
    const dir = mkdtempSync(join(tmpdir(), "aspis-store-"));
    dirs.push(dir);
    return join(dir, "state.db");
};

afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
});

test("creates the database in WAL mode and migrates once", () => {
    const path = tempDb();
    const store = new Store(path);
    expect(store.schemaVersion).toBe(7);
    expect(store.db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()!.journal_mode).toBe("wal");
    store.close();
    const reopened = new Store(path);
    expect(reopened.schemaVersion).toBe(7);
    reopened.close();
});

test("cards written before boards get one board per folder, and the folderless ones share Unsorted", () => {
    const path = tempDb();
    const legacy = new Database(path, { create: true, strict: true });
    for (const [version, step] of migrations.slice(0, 5).entries()) {
        legacy.exec(step as string);
        legacy.exec(`PRAGMA user_version = ${version + 1}`);
    }
    const insert = legacy.query("INSERT INTO cards (title, phase, folder, implementer, auditor, created_at, updated_at) VALUES (?, 'triage', ?, '{}', '{}', 1, 1)");
    insert.run("One", "C:/repos/crm/");
    insert.run("Two", "C:/repos/crm/");
    insert.run("Three", "C:/repos/site");
    insert.run("Four", null);
    legacy.close();

    const store = new Store(path);
    const kanban = new Kanban(store);
    expect(kanban.boards().map(({ name, folder }) => [name, folder])).toEqual([
        ["crm", "C:/repos/crm/"],
        ["site", "C:/repos/site"],
        ["Unsorted", ""],
    ]);
    const boardOf = (title: string) => kanban.boards().find((board) => board.id === store.db.query<{ board_id: number }, [string]>("SELECT board_id FROM cards WHERE title = ?").get(title)!.board_id)!.name;
    expect(["One", "Two", "Three", "Four"].map(boardOf)).toEqual(["crm", "crm", "site", "Unsorted"]);
    store.close();
});

test("each board starts from the runners of its newest card and runs one card at a time", () => {
    const path = tempDb();
    const legacy = new Database(path, { create: true, strict: true });
    for (const [version, step] of migrations.slice(0, 6).entries()) {
        if (typeof step === "string") legacy.exec(step);
        else step(legacy);
        legacy.exec(`PRAGMA user_version = ${version + 1}`);
    }
    const old = { harness: "claude-code", model: "claude-sonnet-5-5", effort: null };
    const latest = { harness: "claude-code", model: "claude-opus-5-5", effort: "high" };
    legacy.query("INSERT INTO boards (name, folder, created_at) VALUES ('crm', 'C:/repos/crm', 1), ('empty', 'C:/repos/empty', 1)").run();
    const insert = legacy.query("INSERT INTO cards (board_id, title, phase, implementer, auditor, created_at, updated_at) VALUES (1, ?, 'triage', ?, ?, 1, 1)");
    insert.run("Old", JSON.stringify(old), JSON.stringify(old));
    insert.run("Latest", JSON.stringify(latest), JSON.stringify(old));
    legacy.close();

    const store = new Store(path);
    const [crm, empty] = new Kanban(store).boards();
    expect(crm).toMatchObject({ maxRunning: 1, runners: { implementer: latest, auditor: old } });
    expect(empty!.runners.implementer).toEqual({ harness: null, model: null, effort: null });
    store.close();
});

test("settings round trip and upsert", () => {
    const store = new Store(tempDb());
    expect(store.getSetting("theme")).toBeUndefined();
    store.setSetting("theme", "io");
    store.setSetting("theme", "nyx");
    expect(store.getSetting("theme")).toBe("nyx");
    store.close();
});

test("watch reports writes made by another connection", async () => {
    const path = tempDb();
    const reader = new Store(path);
    const writer = new Store(path);
    const seen: number[] = [];
    const stop = reader.watch((version) => seen.push(version), 20);
    writer.setSetting("theme", "nyx");
    await Bun.sleep(80);
    stop();
    expect(seen.length).toBe(1);
    expect(reader.getSetting("theme")).toBe("nyx");
    reader.close();
    writer.close();
});
