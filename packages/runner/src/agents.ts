import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type HookHarness, hookHarnesses } from "./ready.ts";

export interface AgentStatus {
    harness: HookHarness;
    cli: boolean;
    installed: boolean;
}

export type Exec = (command: string[]) => Promise<boolean>;

export interface AgentsOptions {
    exe: string;
    launcher?: string;
    home?: string;
    exec?: Exec;
    which?: (name: string) => string | null;
}

const marker = { open: "# >>> dyarchia-aspis: managed by Dyarchia Aspis, remove it from the app", close: "# <<< dyarchia-aspis" };
const hookEvents = ["UserPromptSubmit", "PreToolUse", "Stop"] as const;
const clis: Record<HookHarness, string> = { "claude-code": "claude", "kimi-code": "kimi" };

const skill = `---
name: dya-pickup
description: Pick up the Dyarchia Aspis kanban card that is Ready for this folder. Only when the user types it.
disable-model-invocation: true
---

The Aspis hook has just handed you a card from the Dyarchia Aspis kanban, or told you why there is none, in this
turn's context; it starts with [Aspis]. If you got a card, work on it following its instructions. If you did not,
tell the user why and stop: never look for work on your own.
`;

const run: Exec = async (command) => {
    const proc = Bun.spawn(command, { stdout: "ignore", stderr: "ignore", windowsHide: true });
    return (await proc.exited) === 0;
};

const readJson = (path: string): Record<string, any> => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8") || "{}") : {});

function writeJson(path: string, value: unknown) {
    const before = existsSync(path) ? readFileSync(path, "utf8") : "";
    const indent = /\n( +)"/.exec(before)?.[1]?.length ?? 2;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, indent)}\n`);
}

/*
 * Wires a CLI to the board: its hooks call `aspis-server hook`, the aspis MCP server gives the agent card_note,
 * card_block and card_deliver, and the dya-pickup skill is what the human types. Only ever run from the app, by the
 * human's click, and everything written is recognisable so remove() takes exactly that back out.
 */
export class Agents {
    private readonly home: string;
    private readonly exec: Exec;
    private readonly which: (name: string) => string | null;

    constructor(private readonly options: AgentsOptions) {
        this.home = options.home ?? homedir();
        this.exec = options.exec ?? run;
        this.which = options.which ?? ((name) => Bun.which(name));
    }

    /* The desktop exe answers hooks in milliseconds and only wakes the sidecar for sessions that hold a card. */
    private command(harness: HookHarness) {
        return this.options.launcher ? `"${this.options.launcher}" --hook ${harness}` : `"${this.options.exe}" hook --harness ${harness}`;
    }

    private ours(command: string | undefined, harness: HookHarness) {
        return Boolean(command && (command.includes(`--hook ${harness}`) || command.includes(`hook --harness ${harness}`)));
    }

    private paths(harness: HookHarness) {
        const root = join(this.home, harness === "claude-code" ? ".claude" : ".kimi-code");
        return {
            config: join(root, harness === "claude-code" ? "settings.json" : "config.toml"),
            skill: join(root, "skills", "dya-pickup", "SKILL.md"),
            mcp: join(root, "mcp.json"),
        };
    }

    status(): AgentStatus[] {
        return hookHarnesses.map((harness) => {
            const { config, skill } = this.paths(harness);
            const text = existsSync(config) ? readFileSync(config, "utf8") : "";
            const hooked = harness === "claude-code" ? this.ours(text, harness) : text.includes(marker.open);
            return { harness, cli: Boolean(this.which(clis[harness])), installed: hooked && existsSync(skill) };
        });
    }

    async install(harness: HookHarness): Promise<void> {
        await this.remove(harness);
        const { config, skill: skillPath, mcp } = this.paths(harness);
        mkdirSync(dirname(skillPath), { recursive: true });
        writeFileSync(skillPath, skill);
        if (harness === "claude-code") {
            const settings = readJson(config);
            settings.hooks ??= {};
            for (const event of hookEvents) {
                settings.hooks[event] ??= [];
                settings.hooks[event].push({ ...(event === "PreToolUse" ? { matcher: "*" } : {}), hooks: [{ type: "command", command: this.command(harness), timeout: 15 }] });
            }
            writeJson(config, settings);
            if (!(await this.exec(["claude", "mcp", "add", "--scope", "user", "aspis", "--", this.options.exe, "mcp"]))) throw new Error("claude mcp add refused the aspis server");
            return;
        }
        const blocks = hookEvents.map((event) => `[[hooks]]\nevent = "${event}"\ncommand = '${this.command(harness)}'\ntimeout = 15`);
        const before = existsSync(config) ? readFileSync(config, "utf8").trimEnd() : "";
        mkdirSync(dirname(config), { recursive: true });
        writeFileSync(config, `${before}\n\n${marker.open}\n${blocks.join("\n\n")}\n${marker.close}\n`);
        const servers = readJson(mcp);
        servers.mcpServers = { ...servers.mcpServers, aspis: { command: this.options.exe, args: ["mcp"] } };
        writeJson(mcp, servers);
    }

    async remove(harness: HookHarness): Promise<void> {
        const { config, skill: skillPath, mcp } = this.paths(harness);
        rmSync(dirname(skillPath), { recursive: true, force: true });
        if (harness === "claude-code") {
            if (existsSync(config)) {
                const settings = readJson(config);
                for (const event of hookEvents) {
                    const entries: any[] | undefined = settings.hooks?.[event];
                    if (!entries) continue;
                    settings.hooks[event] = entries.filter((entry) => !entry.hooks?.some((hook: { command?: string }) => this.ours(hook.command, harness)));
                    if (settings.hooks[event].length === 0) delete settings.hooks[event];
                }
                if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
                writeJson(config, settings);
            }
            if (this.which("claude")) await this.exec(["claude", "mcp", "remove", "--scope", "user", "aspis"]);
            return;
        }
        if (existsSync(config)) {
            const text = readFileSync(config, "utf8");
            const start = text.indexOf(marker.open);
            const end = text.indexOf(marker.close);
            if (start >= 0 && end > start) writeFileSync(config, `${text.slice(0, start).trimEnd()}\n${text.slice(end + marker.close.length).replace(/^\n+/, "")}`);
        }
        if (existsSync(mcp)) {
            const servers = readJson(mcp);
            if (servers.mcpServers?.aspis) {
                delete servers.mcpServers.aspis;
                writeJson(mcp, servers);
            }
        }
    }
}
