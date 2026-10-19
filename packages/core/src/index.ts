import { z } from "zod";
import { MaxRunning } from "./kanban.ts";

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

export const Theme = z.enum(["io", "nyx"]);
export type Theme = z.infer<typeof Theme>;

export const Settings = z.object({ theme: Theme, maxRunning: MaxRunning });
export type Settings = z.infer<typeof Settings>;

export const defaultSettings: Settings = { theme: "io", maxRunning: 2 };

export const readSettings = (get: (key: string) => string | undefined): Settings => ({
    theme: Theme.catch(defaultSettings.theme).parse(get("theme")),
    maxRunning: MaxRunning.catch(defaultSettings.maxRunning).parse(Number(get("maxRunning") ?? Number.NaN)),
});

export const ServerEvent = z.discriminatedUnion("type", [
    z.object({ type: z.literal("hello"), dataVersion: z.number().int(), settings: Settings }),
    z.object({ type: z.literal("changed"), dataVersion: z.number().int() }),
    z.object({ type: z.literal("settings"), settings: Settings }),
]);
export type ServerEvent = z.infer<typeof ServerEvent>;
export * from "./kanban.ts";
export * from "./runs.ts";
