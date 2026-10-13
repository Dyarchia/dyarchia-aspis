import { Agents, hookHarnesses } from "@dyarchia/runner";
import { KanbanError } from "@dyarchia/store";
import { Hono } from "hono";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

/* Only the compiled sidecar can wire a CLI: the hooks and the MCP server must point at an exe that stays put. */
export const installedExe = () => (/bun(\.exe)?$/i.test(process.execPath) ? undefined : process.execPath);

export const wiring = (exe: string) => {
    const launcher = join(dirname(exe), "dyarchia-aspis.exe");
    return { exe, launcher: existsSync(launcher) ? launcher : undefined };
};

const harness = (value: string) => {
    const found = hookHarnesses.find((candidate) => candidate === value);
    if (!found) throw new KanbanError(`${value} has no hooks to install`, 400);
    return found;
};

export function agentRoutes() {
    const agents = () => {
        const exe = installedExe();
        if (!exe) throw new KanbanError("CLIs are wired from the installed desktop app, not from a development server", 409);
        return new Agents(wiring(exe));
    };
    return new Hono()
        .get("/", (c) => c.json({ installable: Boolean(installedExe()), agents: new Agents({ exe: installedExe() ?? process.execPath }).status() }))
        .post("/:harness", async (c) => {
            await agents().install(harness(c.req.param("harness")));
            return c.json(agents().status());
        })
        .delete("/:harness", async (c) => {
            await agents().remove(harness(c.req.param("harness")));
            return c.json(agents().status());
        });
}
