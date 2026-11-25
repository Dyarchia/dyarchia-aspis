import { z } from "zod";

export const Health = z.object({
    ok: z.literal(true),
    version: z.string(),
    schemaVersion: z.number().int(),
    dbPath: z.string(),
    pid: z.number().int(),
    startedAt: z.iso.datetime(),
    dev: z.boolean(),
    lastDispatch: z.number().nullable(),
});
export type Health = z.infer<typeof Health>;

export const Theme = z.enum(["dark", "light"]);
export type Theme = z.infer<typeof Theme>;

/*
 * The consoles a command or a terminal session runs in. git-bash is Git Bash on Windows and the system's own bash
 * on macOS and Linux: the same shell and the same scripts everywhere.
 */
export const Console = z.enum(["git-bash", "powershell", "cmd"]);
export type Console = z.infer<typeof Console>;

export const Settings = z.object({ theme: Theme, console: Console });
export type Settings = z.infer<typeof Settings>;

export const defaultSettings: Settings = { theme: "dark", console: "git-bash" };

export const Terminal = z.object({ id: z.string(), board: z.number().int(), label: z.string(), console: Console });
export type Terminal = z.infer<typeof Terminal>;

export const ConsoleChoice = z.object({ id: Console, label: z.string() });
export type ConsoleChoice = z.infer<typeof ConsoleChoice>;

export const ServerEvent = z.discriminatedUnion("type", [
    z.object({ type: z.literal("hello"), dataVersion: z.number().int(), settings: Settings }),
    z.object({ type: z.literal("changed"), dataVersion: z.number().int() }),
    z.object({ type: z.literal("settings"), settings: Settings }),
]);
export type ServerEvent = z.infer<typeof ServerEvent>;
export * from "./kanban.ts";
export * from "./runs.ts";
