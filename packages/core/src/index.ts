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

export const ServerReady = z.object({ port: z.number().int().positive() });
export type ServerReady = z.infer<typeof ServerReady>;

export const ServerEvent = z.discriminatedUnion("type", [
    z.object({ type: z.literal("hello"), dataVersion: z.number().int() }),
    z.object({ type: z.literal("changed"), dataVersion: z.number().int() }),
]);
export type ServerEvent = z.infer<typeof ServerEvent>;
