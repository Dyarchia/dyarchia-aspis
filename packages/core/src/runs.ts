import { z } from "zod";

export const RunStatus = z.enum(["running", "done", "failed", "stopped", "blocked"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const RunKind = z.enum(["headless", "interactive", "audit"]);
export type RunKind = z.infer<typeof RunKind>;

export const Run = z.object({
    id: z.number().int(),
    cardId: z.number().int(),
    attempt: z.number().int(),
    kind: RunKind,
    sessionId: z.string().nullable(),
    status: RunStatus,
    branch: z.string(),
    startedAt: z.number(),
    endedAt: z.number().nullable(),
    error: z.string().nullable(),
    live: z.boolean(),
});
export type Run = z.infer<typeof Run>;

export const RunLog = z.object({ text: z.string(), next: z.number().int(), live: z.boolean() });
export type RunLog = z.infer<typeof RunLog>;

export type RunLineKind = "prompt" | "answer" | "tool" | "dim";

export interface RunLine {
    kind: RunLineKind;
    text: string;
}

type Block = { type: string; text?: string; name?: string; input?: Record<string, unknown>; content?: unknown; is_error?: boolean };

const clip = (text: string, length: number) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

const toolSummary = (input: Record<string, unknown> = {}) => {
    const value = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.description ?? input.prompt;
    return clip(typeof value === "string" ? value.replace(/\s+/g, " ") : JSON.stringify(input), 140);
};

const resultText = (content: unknown): string => {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map((part: Block) => part.text ?? "").join(" ");
    return "";
};

/*
 * Turns the JSON lines a run writes (claude stream-json, the runner's own "aspis" lines, and the prompts, tool
 * calls and answers a CLI session's hooks record) into what the LiveLog shows. Text deltas build the answer letter by letter; once the complete assistant message arrives it replaces
 * them, so nothing is printed twice. Lines that do not parse are skipped: the log may end mid-write.
 */
export function runLines(jsonl: string): RunLine[] {
    const lines: RunLine[] = [];
    let pending = "";
    const text = (kind: RunLineKind, value: string) => {
        for (const line of value.replace(/\r/g, "").split("\n")) lines.push({ kind, text: line });
    };
    for (const raw of jsonl.split("\n")) {
        if (!raw.trim()) continue;
        let event: Record<string, any>;
        try {
            event = JSON.parse(raw);
        } catch {
            continue;
        }
        if (event.type === "aspis") text(event.kind === "prompt" ? "prompt" : event.kind === "answer" ? "answer" : "dim", String(event.text ?? ""));
        if (event.type === "aspis-tool") lines.push({ kind: "tool", text: `${String(event.name ?? "").replace(/^mcp__aspis__/, "aspis ")} ${event.text ?? ""}`.trim() });
        if (event.type === "system" && event.subtype === "init") lines.push({ kind: "dim", text: `${event.model ?? "claude"} · ${event.cwd ?? ""}` });
        if (event.type === "stream_event" && event.event?.delta?.type === "text_delta") pending += event.event.delta.text ?? "";
        if (event.type === "assistant") {
            pending = "";
            for (const block of (event.message?.content ?? []) as Block[]) {
                if (block.type === "text" && block.text?.trim()) text("answer", block.text.trim());
                if (block.type === "tool_use") lines.push({ kind: "tool", text: `${block.name} ${toolSummary(block.input)}` });
            }
        }
        if (event.type === "user") {
            for (const block of (event.message?.content ?? []) as Block[]) {
                if (block.type !== "tool_result") continue;
                const first = resultText(block.content).trim().split("\n")[0] ?? "";
                lines.push({ kind: "dim", text: `${block.is_error ? "error: " : ""}${clip(first, 160)}` });
            }
        }
        if (event.type === "result") {
            const seconds = Math.round(Number(event.duration_ms ?? 0) / 1000);
            const cost = typeof event.total_cost_usd === "number" ? ` · $${event.total_cost_usd.toFixed(2)}` : "";
            lines.push({ kind: "dim", text: `${event.is_error ? "Failed" : "Finished"} in ${seconds}s · ${event.num_turns ?? 0} turns${cost}` });
        }
    }
    if (pending.trim()) text("answer", pending.trim());
    return lines;
}
