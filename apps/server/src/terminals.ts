import { Console, type ConsoleChoice, type Terminal } from "@dyarchia/core";
import { type Kanban, KanbanError } from "@dyarchia/store";
import type { ServerWebSocket, Subprocess } from "bun";
import { Hono } from "hono";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

const windows = process.platform === "win32";

/*
 * Git Bash is found through git itself, wherever it was installed: git.exe sits in cmd, bin or mingw64\bin under the
 * Git root, and bash.exe in its bin. A bare "bash" is never run on Windows, because outside Git Bash it can resolve to
 * the WSL launcher in System32.
 */
function gitBash(): string | undefined {
    const roots = new Set<string>();
    const git = Bun.which("git");
    if (git) for (let dir = dirname(git), step = 0; step < 3; dir = dirname(dir), step++) roots.add(dir);
    for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs")]) if (base) roots.add(join(base, "Git"));
    return [...roots].map((root) => join(root, "bin", "bash.exe")).find((bash) => existsSync(bash));
}

interface Shell extends ConsoleChoice {
    command: string[];
    env?: Record<string, string>;
}

/*
 * The consoles this machine has, by the ids commands use. Git Bash starts as a login shell so its profile runs,
 * and CHERE_INVOKING keeps that login in the session's folder instead of moving it home.
 */
export function shells(): Shell[] {
    const found: Shell[] = [];
    const bash = windows ? gitBash() : Bun.which("bash");
    if (bash) found.push({ id: "git-bash", label: windows ? "Git Bash" : "Bash", command: [bash, "--login", "-i"], env: { CHERE_INVOKING: "1" } });
    const pwsh = Bun.which("pwsh") ?? (windows ? Bun.which("powershell") : null);
    if (pwsh) found.push({ id: "powershell", label: "PowerShell", command: [pwsh, "-NoLogo"] });
    if (windows) found.push({ id: "cmd", label: "Command Prompt", command: [process.env.ComSpec ?? "cmd.exe"] });
    return found;
}

const replayLimit = 512 * 1024;

interface Session extends Terminal {
    proc: Subprocess;
    pty: Bun.Terminal;
    replay: Uint8Array[];
    bytes: number;
    sockets: Set<ServerWebSocket<TerminalSocket>>;
}

export interface TerminalSocket {
    terminal: string;
}

const Message = z.discriminatedUnion("type", [
    z.object({ type: z.literal("input"), data: z.string() }),
    z.object({ type: z.literal("resize"), cols: z.number().int().min(2).max(1000), rows: z.number().int().min(2).max(500) }),
]);

/*
 * Terminal sessions live in the server, not in the page: switching view, closing the window to the tray or reloading
 * the UI leaves the shell running, and a page that attaches again is sent what the shell printed meanwhile (the last
 * half megabyte) before the live stream. A session ends when its shell exits or when it is closed, and closing kills
 * the whole process tree, so nothing started from it outlives it. ASPIS_SHELL replaces every console with one command
 * line, so tests never depend on what the machine has installed.
 */
export class Terminals {
    private readonly sessions = new Map<string, Session>();
    private readonly numbers = new Map<number, number>();

    constructor(private readonly changed: () => void) {}

    list(): Terminal[] {
        return [...this.sessions.values()].map(({ id, board, label, console }) => ({ id, board, label, console }));
    }

    open(board: { id: number; folder: string }, console: Console, size = { cols: 100, rows: 30 }): Terminal {
        const override = process.env.ASPIS_SHELL ? (JSON.parse(process.env.ASPIS_SHELL) as string[]) : undefined;
        const available = shells();
        const shell = override ? { id: console, label: console, command: override } : (available.find((entry) => entry.id === console) ?? available[0]);
        if (!shell) throw new KanbanError("No console was found on this machine", 409);
        const number = (this.numbers.get(board.id) ?? 0) + 1;
        this.numbers.set(board.id, number);
        const id = crypto.randomUUID();
        const session = { id, board: board.id, label: `Session ${number}`, console: shell.id, replay: [], bytes: 0, sockets: new Set() } as unknown as Session;
        session.pty = new Bun.Terminal({
            ...size,
            name: "xterm-256color",
            data: (_pty, data) => {
                const chunk = data.slice();
                session.replay.push(chunk);
                session.bytes += chunk.byteLength;
                while (session.bytes > replayLimit && session.replay.length > 1) session.bytes -= session.replay.shift()!.byteLength;
                for (const socket of session.sockets) socket.sendBinary(chunk);
            },
        });
        session.proc = Bun.spawn(shell.command, {
            cwd: existsSync(board.folder) ? board.folder : homedir(),
            env: { ...process.env, ...("env" in shell ? shell.env : {}), TERM: "xterm-256color", COLORTERM: "truecolor" },
            terminal: session.pty,
            windowsHide: true,
        });
        void session.proc.exited.then(() => this.end(id));
        this.sessions.set(id, session);
        this.changed();
        return { id, board: board.id, label: session.label, console: shell.id };
    }

    private end(id: string) {
        const session = this.sessions.get(id);
        if (!session) return;
        this.sessions.delete(id);
        for (const socket of session.sockets) socket.close(1000, "exited");
        session.pty.close();
        this.changed();
    }

    close(id: string) {
        const session = this.sessions.get(id);
        if (!session) throw new KanbanError("That session has already ended", 404);
        this.kill(session);
        this.end(id);
    }

    private kill(session: Session) {
        if (windows) Bun.spawnSync(["taskkill", "/T", "/F", "/PID", String(session.proc.pid)], { stdout: "ignore", stderr: "ignore", windowsHide: true });
        else {
            try {
                process.kill(-session.proc.pid, "SIGHUP");
            } catch {
                session.proc.kill("SIGHUP");
            }
        }
    }

    closeAll() {
        for (const session of this.sessions.values()) this.kill(session);
        for (const id of [...this.sessions.keys()]) this.end(id);
    }

    has(id: string) {
        return this.sessions.has(id);
    }

    attach(socket: ServerWebSocket<TerminalSocket>) {
        const session = this.sessions.get(socket.data.terminal);
        if (!session) return socket.close(4404, "no such session");
        if (session.bytes > 0) {
            const all = new Uint8Array(session.bytes);
            let at = 0;
            for (const chunk of session.replay) all.set(chunk, (at += chunk.byteLength) - chunk.byteLength);
            socket.sendBinary(all);
        }
        session.sockets.add(socket);
    }

    detach(socket: ServerWebSocket<TerminalSocket>) {
        this.sessions.get(socket.data.terminal)?.sockets.delete(socket);
    }

    receive(socket: ServerWebSocket<TerminalSocket>, raw: string | Buffer) {
        const session = this.sessions.get(socket.data.terminal);
        if (!session) return;
        let message: z.infer<typeof Message>;
        try {
            message = Message.parse(JSON.parse(String(raw)));
        } catch {
            return;
        }
        if (message.type === "input") session.pty.write(message.data);
        else session.pty.resize(message.cols, message.rows);
    }
}

const Open = z.object({ board: z.number().int(), console: Console.optional(), cols: z.number().int().min(2).max(1000).optional(), rows: z.number().int().min(2).max(500).optional() });

export function terminalRoutes(terminals: Terminals, kanban: Kanban, console: () => Console) {
    return new Hono()
        .get("/", (c) => c.json(terminals.list()))
        .get("/consoles", (c) => c.json(shells().map(({ id, label }) => ({ id, label }))))
        .post("/", async (c) => {
            const draft = Open.parse(await c.req.json());
            const size = draft.cols && draft.rows ? { cols: draft.cols, rows: draft.rows } : undefined;
            return c.json(terminals.open(kanban.board(draft.board), draft.console ?? console(), size), 201);
        })
        .delete("/:id", (c) => {
            terminals.close(c.req.param("id"));
            return c.body(null, 204);
        });
}
