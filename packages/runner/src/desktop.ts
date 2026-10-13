import { Kanban, Runs, type Store } from "@dyarchia/store";
import { spawn } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/* How long a card that waits on its repository (uncommitted changes, another branch) waits before looking again. */
export const retryAfterMs = 15 * 60_000;

const folder = "\\Dyarchia Aspis\\";
const prefix = `${folder}card-`;

export type Exec = (command: string[]) => Promise<{ ok: boolean; out: string }>;

export const alive = (pid: number) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM";
    }
};

const run: Exec = async (command) => {
    const proc = Bun.spawn(command, { stdout: "pipe", stderr: "ignore", windowsHide: true });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return { ok: code === 0, out };
};

/* The desktop exe sits next to the compiled sidecar; under bun (development, tests) there is none. */
export function launcherPath(): string | undefined {
    if (/bun(\.exe)?$/i.test(process.execPath)) return undefined;
    const launcher = join(dirname(process.execPath), "dyarchia-aspis.exe");
    return existsSync(launcher) ? launcher : undefined;
}

const stamp = (at: number) => {
    const date = new Date(at);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const taskXml = (launcher: string, at: number) => `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Starts a Dyarchia Aspis Scheduled card at its time.</Description></RegistrationInfo>
  <Triggers><TimeTrigger><StartBoundary>${stamp(at)}</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author"><Exec><Command>${escape(launcher)}</Command><Arguments>--dispatch</Arguments></Exec></Actions>
</Task>
`;

export interface DesktopOptions {
    store: Store;
    launcher?: string;
    exec?: Exec;
    kick?: () => void;
    notify?: (title: string, lines: string[]) => void;
}

/*
 * Nothing polls. Each Scheduled card has its own one-shot Task Scheduler entry at its time (or at the time it
 * looks again after waiting on its repository), named card-<id>-<epoch ms> so the wanted time can be read back
 * from the name. Work that is due right now (a card past its time, a card you unblocked, an audit to run) is
 * started at once by kick(), which launches the desktop exe with --dispatch, detached and without a window.
 * sync() makes Task Scheduler match the board and kicks when something is due; anything that changes the board
 * calls it. Without the desktop exe (development, tests) none of this happens.
 */
export class Desktop {
    readonly launcher: string | undefined;
    private readonly kanban: Kanban;
    private readonly runs: Runs;
    private readonly exec: Exec;

    constructor(private readonly options: DesktopOptions) {
        this.launcher = "launcher" in options ? options.launcher : launcherPath();
        this.kanban = new Kanban(options.store);
        this.runs = new Runs(options.store);
        this.exec = options.exec ?? run;
    }

    kick(): void {
        if (this.options.kick) return this.options.kick();
        if (!this.launcher) return;
        spawn(this.launcher, ["--dispatch"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    }

    notify(title: string, lines: string[]): void {
        if (this.options.notify) return this.options.notify(title, lines);
        if (!this.launcher) return;
        spawn(this.launcher, ["--notify", title, ...lines], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    }

    /* When each Scheduled card should next be looked at, for the ones whose time is still ahead. */
    wakes(now = Date.now()): Map<number, number> {
        const wakes = new Map<number, number>();
        for (const card of this.kanban.list()) {
            if (card.phase !== "scheduled" || card.scheduledAt === null) continue;
            const at = card.scheduledAt > now ? card.scheduledAt : (card.wakeAt ?? 0);
            if (at > now) wakes.set(card.id, at);
        }
        return wakes;
    }

    /* Whether anything can start right now. */
    due(now = Date.now()): boolean {
        return this.kanban.list().some((card) => {
            const waiting = card.wakeAt !== null && card.wakeAt > now;
            if (card.phase === "scheduled") return card.scheduledAt !== null && card.scheduledAt <= now && !waiting;
            if (card.phase === "running" && card.route === "scheduled") return !waiting && !this.runs.live(card.id, now);
            if (card.phase === "review" && card.route === "ready")
                return !card.auditorVerdict && !card.held && !this.runs.list(card.id, now).some((run) => run.kind === "audit" && run.live);
            return false;
        });
    }

    async tasks(): Promise<Map<number, { name: string; at: number }>> {
        const found = new Map<number, { name: string; at: number }>();
        const { out } = await this.exec(["schtasks", "/Query", "/FO", "CSV", "/NH"]);
        for (const line of out.split(/\r?\n/)) {
            const name = line.match(/^"([^"]+)"/)?.[1];
            const parts = name?.startsWith(prefix) ? /^(\d+)-(\d+)$/.exec(name.slice(prefix.length)) : null;
            if (parts) found.set(Number(parts[1]), { name: name!, at: Number(parts[2]) });
        }
        return found;
    }

    async sync({ kick = true, now = Date.now() }: { kick?: boolean; now?: number } = {}): Promise<void> {
        if (!this.launcher) return;
        this.runs.reapDead(alive, now);
        const wanted = this.wakes(now);
        const existing = await this.tasks();
        for (const [id, task] of existing) {
            if (wanted.get(id) !== task.at) await this.exec(["schtasks", "/Delete", "/TN", task.name, "/F"]);
        }
        for (const [id, at] of wanted) {
            if (existing.get(id)?.at === at) continue;
            const file = join(tmpdir(), `dyarchia-aspis-card-${id}.xml`);
            const bytes = Buffer.from(`﻿${taskXml(this.launcher, at)}`, "utf16le");
            writeFileSync(file, bytes);
            await this.exec(["schtasks", "/Create", "/TN", `${prefix}${id}-${at}`, "/XML", file, "/F"]);
            rmSync(file, { force: true });
        }
        if (kick && this.due(now)) this.kick();
    }

    /* The once-a-minute dispatcher of 0.4 and 0.5 is gone; installs that still have it lose it here. */
    async retire(): Promise<void> {
        if (this.launcher) await this.exec(["schtasks", "/Delete", "/TN", `${folder}Dispatcher`, "/F"]);
    }

    /* Removes every task this app created, for the uninstaller. */
    async clear(): Promise<void> {
        for (const task of (await this.tasks()).values()) await this.exec(["schtasks", "/Delete", "/TN", task.name, "/F"]);
        await this.retire();
    }
}
