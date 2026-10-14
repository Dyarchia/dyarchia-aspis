import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agents } from "./agents.ts";

const exe = "C:\\Users\\Someone\\AppData\\Local\\Dyarchia Aspis\\aspis-server.exe";
const launcher = "C:\\Users\\Someone\\AppData\\Local\\Dyarchia Aspis\\dyarchia-aspis.exe";
let home: string;
let calls: string[][];
let agents: Agents;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aspis-agents-"));
    calls = [];
    agents = new Agents({ exe, launcher, home, which: (name) => `C:\\bin\\${name}.exe`, exec: async (command) => (calls.push(command), true) });
});

afterEach(() => rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));

test("claude code gets its hooks, skill and MCP server next to what was there, and loses only those", async () => {
    const settings = join(home, ".claude", "settings.json");
    mkdirSync(join(home, ".claude"), { recursive: true });
    const before = { model: "opus", hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "lint.sh" }] }] } };
    writeFileSync(settings, JSON.stringify(before, null, 4));

    await agents.install("claude-code");
    const installed = JSON.parse(readFileSync(settings, "utf8"));
    expect(installed.model).toBe("opus");
    expect(installed.hooks.PreToolUse).toHaveLength(2);
    expect(installed.hooks.Stop[0].hooks[0].command).toBe(`"${launcher}" --hook claude-code`);
    expect(readFileSync(settings, "utf8")).toContain('\n    "model"');
    expect(existsSync(join(home, ".claude", "skills", "dya-pickup", "SKILL.md"))).toBe(true);
    expect(calls.at(-1)).toEqual(["claude", "mcp", "add", "--scope", "user", "aspis", "--", exe, "mcp"]);
    expect(agents.status().find((status) => status.harness === "claude-code")).toEqual({ harness: "claude-code", cli: true, installed: true });

    await agents.install("claude-code");
    expect(JSON.parse(readFileSync(settings, "utf8")).hooks.PreToolUse).toHaveLength(2);

    await agents.remove("claude-code");
    expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual(before);
    expect(existsSync(join(home, ".claude", "skills", "dya-pickup"))).toBe(false);
    expect(calls.at(-1)).toEqual(["claude", "mcp", "remove", "--scope", "user", "aspis"]);
});

test("kimi gets a marked block of hooks, its MCP entry and the skill, and removing restores the files", async () => {
    const config = join(home, ".kimi-code", "config.toml");
    const mcp = join(home, ".kimi-code", "mcp.json");
    mkdirSync(join(home, ".kimi-code"), { recursive: true });
    const toml = '[providers."managed:kimi-code"]\ntype = "kimi"\n';
    writeFileSync(config, toml);
    writeFileSync(mcp, JSON.stringify({ mcpServers: { other: { command: "x" } } }, null, 2));

    await agents.install("kimi-code");
    const text = readFileSync(config, "utf8");
    expect(text.startsWith(toml.trimEnd())).toBe(true);
    expect(text.match(/\[\[hooks\]\]/g)).toHaveLength(3);
    expect(text).toContain(`command = '"${launcher}" --hook kimi-code'`);
    expect(JSON.parse(readFileSync(mcp, "utf8")).mcpServers).toEqual({ other: { command: "x" }, aspis: { command: exe, args: ["mcp"] } });
    expect(agents.status().find((status) => status.harness === "kimi-code")?.installed).toBe(true);

    await agents.remove("kimi-code");
    expect(readFileSync(config, "utf8")).toBe(toml);
    expect(JSON.parse(readFileSync(mcp, "utf8")).mcpServers).toEqual({ other: { command: "x" } });
    expect(agents.status().find((status) => status.harness === "kimi-code")?.installed).toBe(false);
});
