import { afterAll, expect, test } from "bun:test";
import { Health, ServerEvent, Settings } from "@dyarchia/core";
import { Store } from "@dyarchia/store";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./app.ts";

const dir = mkdtempSync(join(tmpdir(), "aspis-server-"));
const store = new Store(join(dir, "state.db"));
const { server, stop } = startServer({ store, token: "secret", hostname: "127.0.0.1", port: 0 });
const base = `http://127.0.0.1:${server.port}`;

afterAll(() => {
    stop();
    store.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
});

test("rejects requests without the token", async () => {
    expect((await fetch(`${base}/health`)).status).toBe(401);
    expect((await fetch(`${base}/health`, { headers: { authorization: "Bearer nope" } })).status).toBe(401);
});

test("serves health with the token", async () => {
    const res = await fetch(`${base}/health`, { headers: { authorization: "Bearer secret" } });
    const health = Health.parse(await res.json());
    expect(health.schemaVersion).toBe(6);
    expect(health.dbPath).toBe(store.path);
});

test("answers CORS preflight from the desktop origin", async () => {
    const res = await fetch(`${base}/health`, {
        method: "OPTIONS",
        headers: { origin: "http://tauri.localhost", "access-control-request-method": "GET" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://tauri.localhost");
});

test("persists the theme and broadcasts it", async () => {
    const auth = { authorization: "Bearer secret", "content-type": "application/json" };
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=secret`);
    const events: ServerEvent[] = [];
    ws.onmessage = (e) => events.push(ServerEvent.parse(JSON.parse(String(e.data))));
    await new Promise((resolve) => (ws.onopen = resolve));

    expect(Settings.parse(await (await fetch(`${base}/settings`, { headers: auth })).json()).theme).toBe("io");
    const put = await fetch(`${base}/settings`, { method: "PUT", headers: auth, body: JSON.stringify({ theme: "nyx" }) });
    expect(Settings.parse(await put.json()).theme).toBe("nyx");
    expect(store.getSetting("theme")).toBe("nyx");
    expect((await fetch(`${base}/settings`, { method: "PUT", headers: auth, body: JSON.stringify({ theme: "light" }) })).status).toBe(400);

    await Bun.sleep(50);
    ws.close();
    expect(events).toContainEqual({ type: "settings", settings: { theme: "nyx" } });
});

test("pushes a change when another connection writes", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=secret`);
    const events: ServerEvent[] = [];
    ws.onmessage = (e) => events.push(ServerEvent.parse(JSON.parse(String(e.data))));
    await new Promise((resolve) => (ws.onopen = resolve));
    const other = new Store(store.path);
    other.setSetting("probe", "1");
    other.close();
    await Bun.sleep(700);
    ws.close();
    expect(events[0]?.type).toBe("hello");
    expect(events.some((e) => e.type === "changed")).toBe(true);
});
