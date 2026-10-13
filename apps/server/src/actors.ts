import { Actor, MoveRequest } from "@dyarchia/core";
import type { Kanban } from "@dyarchia/store";
import { Hono } from "hono";
import { Note, VerdictBody, id } from "./cards.ts";

const ActorMove = MoveRequest.extend({ actor: Actor });
const ActorNote = Note.extend({ actor: Actor });

/*
 * Development only: lets the e2e suite and the dev UI act as the agent, the system or the auditor until the real
 * runners arrive in S3 and S4. It goes through exactly the same Kanban service and rules. Only dev.ts imports
 * this module; the sidecar is compiled from main.ts, so none of it reaches the shipped binary.
 */
export function actorRoutes(kanban: Kanban, changed: () => void) {
    return new Hono()
        .post("/cards/:id/move", async (c) => {
            const { actor, ...request } = ActorMove.parse(await c.req.json());
            const card = kanban.move(id(c.req.param("id")), request, actor);
            changed();
            return c.json(card);
        })
        .post("/cards/:id/verdict", async (c) => {
            const { ok, reason } = VerdictBody.parse(await c.req.json());
            const card = kanban.verdict(id(c.req.param("id")), "auditor", ok, reason);
            changed();
            return c.json(card);
        })
        .post("/cards/:id/notes", async (c) => {
            const { actor, text } = ActorNote.parse(await c.req.json());
            const event = kanban.note(id(c.req.param("id")), text, actor);
            changed();
            return c.json(event);
        });
}
