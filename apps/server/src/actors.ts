import { Actor, MoveRequest } from "@dyarchia/core";
import { Dispatcher } from "@dyarchia/runner";
import { Store } from "@dyarchia/store";
import { Hono } from "hono";
import type { ExtensionContext } from "./app.ts";
import { Note, VerdictBody, id } from "./cards.ts";

const ActorMove = MoveRequest.extend({ actor: Actor });
const ActorNote = Note.extend({ actor: Actor });

/*
 * Development only: lets the e2e suite and the dev UI act as the agent, the system or the auditor, and run the
 * dispatcher on demand instead of waiting for Task Scheduler. Everything goes through the same Kanban service and
 * rules. Only dev.ts imports this module; the sidecar is compiled from main.ts, so none of it reaches the shipped
 * binary. The dispatcher gets its own connection so its writes reach clients like any other process's.
 */
export function actorRoutes({ store, kanban, changed }: ExtensionContext) {
    let dispatcher: Dispatcher | undefined;
    return new Hono()
        .post("/dispatch", async (c) => {
            dispatcher ??= new Dispatcher({ store: new Store(store.path) });
            const claims = await dispatcher.claim();
            const audits = await dispatcher.audits();
            void Promise.all([...claims.map((claim) => dispatcher!.execute(claim)), ...audits.map((audit) => dispatcher!.audit(audit))]);
            changed();
            return c.json({ started: [...claims, ...audits].map((work) => work.card.id) });
        })
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
