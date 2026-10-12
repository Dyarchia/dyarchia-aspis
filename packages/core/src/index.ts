import { z } from "zod";

export const Health = z.object({
    ok: z.literal(true),
    version: z.string(),
    schemaVersion: z.number().int(),
    dbPath: z.string(),
    pid: z.number().int(),
    startedAt: z.iso.datetime(),
});
export type Health = z.infer<typeof Health>;

export const Theme = z.enum(["io", "nyx"]);
export type Theme = z.infer<typeof Theme>;

export const Settings = z.object({ theme: Theme });
export type Settings = z.infer<typeof Settings>;

export const defaultSettings: Settings = { theme: "io" };

export const ServerEvent = z.discriminatedUnion("type", [
    z.object({ type: z.literal("hello"), dataVersion: z.number().int() }),
    z.object({ type: z.literal("changed"), dataVersion: z.number().int() }),
    z.object({ type: z.literal("settings"), settings: Settings }),
]);
export type ServerEvent = z.infer<typeof ServerEvent>;
