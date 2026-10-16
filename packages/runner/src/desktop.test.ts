import { Kanban, Store } from "@dyarchia/store";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import { Desktop, retryAfterMs } from "./desktop.ts";
import { tempFolders } from "./testing.ts";

const runner = { harness: "claude-code", model: "claude-opus-5-5", effort: "high" };
const now = new Date(2026, 9, 14, 9, 0).getTime();
const folder = tempFolders("aspis-desktop-");

let dir: string;
let store: Store;
let kanban: Kanban;
let calls: string[][];
let listing: string;
let kicks: number;
let desktop: Desktop;

beforeEach(() => {
    dir = folder();
    store = new Store(join(dir, "state.db"));
    kanban = new Kanban(store);
    calls = [];
    kicks = 0;
    listing = "";
    desktop = new Desktop({
        store,
        launcher: "C:\\Apps\\Dyarchia Aspis\\dyarchia-aspis.exe",
        exec: async (command) => (calls.push(command), { ok: true, out: command[1] === "/Query" ? listing : "" }),
        kick: () => kicks++,
    });
});

afterEach(() => store.close());

function scheduled(at: number) {
    const card = kanban.create("Nightly");
    kanban.edit(card.id, { brief: "x", implementer: runner, folder: "C:/repo", scheduledAt: at }, "human", now);
    return kanban.move(card.id, { to: "scheduled" }, "human", now).id;
}

test("each future card gets a one-shot task named after its time, and stale ones go", async () => {
    const later = scheduled(now + 3_600_000);
    const waiting = scheduled(now - 60_000);
    kanban.hold(waiting, "repo has uncommitted changes", now + retryAfterMs);
    listing = ['"\\Dyarchia Aspis\\card-99-123","N/A","Ready"', `"\\Dyarchia Aspis\\card-${later}-${now + 3_600_000}","x","Ready"`, '"\\Microsoft\\Other","x","Ready"'].join("\r\n");

    await desktop.sync({ now });
    expect(calls.filter((call) => call[1] === "/Delete").map((call) => call[3])).toEqual(["\\Dyarchia Aspis\\card-99-123"]);
    expect(calls.filter((call) => call[1] === "/Create").map((call) => call[3])).toEqual([`\\Dyarchia Aspis\\card-${waiting}-${now + retryAfterMs}`]);
    expect(kicks).toBe(0);
});

test("work that is due now is kicked instead of scheduled", async () => {
    scheduled(now - 1000);
    await desktop.sync({ now });
    expect(calls.filter((call) => call[1] === "/Create")).toEqual([]);
    expect(kicks).toBe(1);
    await desktop.sync({ now, kick: false });
    expect(kicks).toBe(1);
});

test("without the desktop exe nothing is scheduled", async () => {
    scheduled(now + 60_000);
    const bare = new Desktop({ store, launcher: undefined, exec: async (command) => (calls.push(command), { ok: true, out: "" }) });
    await bare.sync({ now });
    expect(calls).toEqual([]);
});
