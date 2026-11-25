import { afterAll, expect, test } from "bun:test";
import { Board, Terminal } from "@dyarchia/core";
import { Store } from "@dyarchia/store";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./app.ts";
import { shells } from "./terminals.ts";

/*
 * The console is a small Bun program that answers each line with what it got and the folder it runs in, so the
 * test sees input reach the PTY, output come back and the session start in its project folder, on any machine.
 */
const dir = mkdtempSync(join(tmpdir(), "aspis-terminals-"));
const project = join(dir, "demo");
mkdirSync(project);
const echo = join(dir, "echo.ts");
writeFileSync(echo, `console.log("ready in " + process.cwd());\nfor await (const line of console) console.log("got:" + line.trim());\n`);
process.env.ASPIS_SHELL = JSON.stringify([process.execPath, echo]);

const store = new Store(join(dir, "state.db"));
const { server, stop } = startServer({ store, token: "secret", hostname: "127.0.0.1", port: 0 });
const base = `http://127.0.0.1:${server.port}`;
const headers = { authorization: "Bearer secret", "content-type": "application/json" };

afterAll(() => {
    stop();
    store.close();
    delete process.env.ASPIS_SHELL;
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
});

const until = async (check: () => boolean, ms = 8000) => {
    const end = Date.now() + ms;
    while (!check()) {
        if (Date.now() > end) throw new Error("timed out");
        await Bun.sleep(25);
    }
};

const attach = (id: string) => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/terminals/${id}/ws?token=secret`);
    socket.binaryType = "arraybuffer";
    const seen = { text: "", closed: false };
    socket.onmessage = (event) => (seen.text += new TextDecoder().decode(event.data as ArrayBuffer));
    socket.onclose = () => (seen.closed = true);
    return { socket, seen, open: new Promise((resolve) => (socket.onopen = resolve)) };
};

let made: Promise<Board> | undefined;
const board = () => (made ??= fetch(`${base}/boards`, { method: "POST", headers, body: JSON.stringify({ name: "demo", folder: project }) }).then(async (res) => Board.parse(await res.json())));

test("a session runs its console in the project folder, echoes input and replays its output to a page that comes back", async () => {
    const { id: boardId } = await board();
    const opened = await fetch(`${base}/terminals`, { method: "POST", headers, body: JSON.stringify({ board: boardId, cols: 80, rows: 24 }) });
    expect(opened.status).toBe(201);
    const session = Terminal.parse(await opened.json());
    expect(session.label).toBe("Session 1");

    const first = attach(session.id);
    await first.open;
    await until(() => first.seen.text.includes("ready in"));
    expect(first.seen.text.replace(/\s+/g, "")).toContain(project.replace(/\s+/g, ""));
    first.socket.send(JSON.stringify({ type: "input", data: "hello\r" }));
    await until(() => first.seen.text.includes("got:hello"));
    first.socket.send(JSON.stringify({ type: "resize", cols: 120, rows: 40 }));
    first.socket.close();

    const again = attach(session.id);
    await again.open;
    await until(() => again.seen.text.includes("got:hello"));
    again.socket.close();

    expect(Terminal.array().parse(await (await fetch(`${base}/terminals`, { headers })).json()).map((entry) => entry.id)).toEqual([session.id]);
    expect((await fetch(`${base}/terminals/${session.id}`, { method: "DELETE", headers })).status).toBe(204);
    expect(await (await fetch(`${base}/terminals`, { headers })).json()).toEqual([]);
});

test("closing a session kills its console, and an ended session cannot be attached", async () => {
    const { id: boardId } = await board();
    const session = Terminal.parse(await (await fetch(`${base}/terminals`, { method: "POST", headers, body: JSON.stringify({ board: boardId }) })).json());
    const live = attach(session.id);
    await live.open;
    await until(() => live.seen.text.includes("ready in"));
    await fetch(`${base}/terminals/${session.id}`, { method: "DELETE", headers });
    await until(() => live.seen.closed);
    expect((await fetch(`${base}/terminals/${session.id}/ws?token=secret`, { headers: { upgrade: "websocket" } })).status).toBe(404);
});

test("a terminal socket from a page of another origin is refused, token or not", async () => {
    const { id: boardId } = await board();
    const session = Terminal.parse(await (await fetch(`${base}/terminals`, { method: "POST", headers, body: JSON.stringify({ board: boardId }) })).json());
    const refused = await fetch(`${base}/terminals/${session.id}/ws?token=secret`, { headers: { upgrade: "websocket", connection: "Upgrade", origin: "https://evil.example" } });
    expect(refused.status).toBe(401);
    await fetch(`${base}/terminals/${session.id}`, { method: "DELETE", headers });
});

test.if(process.platform === "win32")("Git Bash is found through git, never as a bare bash that could be WSL", () => {
    const bash = shells().find((shell) => shell.id === "git-bash");
    expect(bash?.label).toBe("Git Bash");
    expect(bash?.command[0]).toMatch(/[\\/]bin[\\/]bash\.exe$/i);
    expect(bash?.command[0]?.toLowerCase()).not.toContain("system32");
});
