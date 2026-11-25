import type { RunLog } from "@dyarchia/core";
import { type Kanban, KanbanError, type Runs } from "@dyarchia/store";
import { Hono } from "hono";
import { id } from "./cards.ts";

const chunk = 2 * 1024 * 1024;
const decoder = new TextDecoder();

export function runRoutes(kanban: Kanban, runs: Runs, changed: () => void) {
    return new Hono()
        .get("/:id/runs", (c) => c.json(runs.list(id(c.req.param("id")))))
        .get("/:id/runs/:run/log", async (c) => {
            const run = runs.get(id(c.req.param("run")));
            if (run.cardId !== id(c.req.param("id"))) throw new KanbanError("That run belongs to another card", 404);
            const from = Math.max(0, Number(c.req.query("from") ?? 0) || 0);
            const file = Bun.file(runs.logPath(run));
            if (!(await file.exists())) return c.json<RunLog>({ text: "", next: from, live: run.live });
            const bytes = new Uint8Array(await file.slice(from, from + chunk).arrayBuffer());
            const end = bytes.lastIndexOf(10) + 1;
            return c.json<RunLog>({ text: decoder.decode(bytes.subarray(0, end)), next: from + end, live: run.live });
        })
        .post("/:id/audit", (c) => {
            const card = kanban.get(id(c.req.param("id")));
            if (card.phase !== "review" || card.route !== "ready" || card.auditorVerdict || !card.held) throw new KanbanError("Only an audit that could not run can be retried", 409);
            kanban.hold(card.id, null);
            changed();
            return c.body(null, 204);
        })
        .post("/:id/stop", (c) => {
            const card = kanban.get(id(c.req.param("id")));
            if (card.phase !== "running" || card.route !== "scheduled") throw new KanbanError("Only a running Scheduled card can be stopped", 409);
            if (!runs.requestStop(card.id)) kanban.move(card.id, { to: "blocked", note: "Stopped by you." }, "system");
            changed();
            return c.body(null, 204);
        });
}
