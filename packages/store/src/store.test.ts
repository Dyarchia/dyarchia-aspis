import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "./index.ts";

const dirs: string[] = [];
const tempDb = () => {
    const dir = mkdtempSync(join(tmpdir(), "aspis-store-"));
    dirs.push(dir);
    return join(dir, "state.db");
};

afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("creates the database in WAL mode and migrates once", () => {
    const path = tempDb();
    const store = new Store(path);
    expect(store.schemaVersion).toBe(1);
    expect(store.db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()!.journal_mode).toBe("wal");
    store.close();
    const reopened = new Store(path);
    expect(reopened.schemaVersion).toBe(1);
    reopened.close();
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
