import { BoardDraft, BoardEdit, CardEdit, MoveRequest } from "@dyarchia/core";
import { type Kanban, KanbanError } from "@dyarchia/store";
import { Hono } from "hono";
import { z } from "zod";

const NewCard = z.object({ title: z.string(), board: z.number().int() });
export const Note = z.object({ text: z.string() });
export const VerdictBody = z.object({ ok: z.boolean(), reason: z.string() });
export const id = (value: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new KanbanError(`${value} is not an id`, 400);
    return parsed;
};

const mutator =
    (changed: () => void) =>
    <T>(action: () => T): T => {
        const result = action();
        changed();
        return result;
    };

export function boardRoutes(kanban: Kanban, changed: () => void) {
    const mutate = mutator(changed);
    return new Hono()
        .get("/", (c) => c.json(kanban.boards()))
        .post("/", async (c) => {
            const draft = BoardDraft.parse(await c.req.json());
            return c.json(
                mutate(() => kanban.createBoard(draft)),
                201,
            );
        })
        .patch("/:id", async (c) => {
            const edit = BoardEdit.parse(await c.req.json());
            return c.json(mutate(() => kanban.editBoard(id(c.req.param("id")), edit)));
        })
        .delete("/:id", (c) => {
            mutate(() => kanban.removeBoard(id(c.req.param("id"))));
            return c.body(null, 204);
        });
}

export function cardRoutes(kanban: Kanban, changed: () => void) {
    const mutate = mutator(changed);
    return new Hono()
        .get("/", (c) => c.json(kanban.list()))
        .post("/", async (c) => {
            const { title, board } = NewCard.parse(await c.req.json());
            return c.json(
                mutate(() => kanban.create(title, board)),
                201,
            );
        })
        .get("/:id", (c) => {
            const card = id(c.req.param("id"));
            return c.json({ card: kanban.get(card), events: kanban.events(card), delivered: kanban.delivered(card), targets: kanban.targets(card, "human") });
        })
        .patch("/:id", async (c) => {
            const edit = CardEdit.parse(await c.req.json());
            return c.json(mutate(() => kanban.edit(id(c.req.param("id")), edit, "human")));
        })
        .delete("/:id", (c) => {
            mutate(() => kanban.remove(id(c.req.param("id"))));
            return c.body(null, 204);
        })
        .post("/:id/move", async (c) => {
            const request = MoveRequest.parse(await c.req.json());
            return c.json(mutate(() => kanban.move(id(c.req.param("id")), request, "human")));
        })
        .post("/:id/notes", async (c) => {
            const { text } = Note.parse(await c.req.json());
            return c.json(mutate(() => kanban.note(id(c.req.param("id")), text, "human")));
        })
        .post("/:id/verdict", async (c) => {
            const { ok, reason } = VerdictBody.parse(await c.req.json());
            return c.json(mutate(() => kanban.verdict(id(c.req.param("id")), "human", ok, reason)));
        })
        .post("/:id/files", async (c) => {
            const form = await c.req.formData();
            const file = form.get("file");
            if (!(file instanceof File)) throw new KanbanError("Send the file in a field called file", 400);
            const content = new Uint8Array(await file.arrayBuffer());
            return c.json(mutate(() => kanban.addFile(id(c.req.param("id")), file.name, content)));
        })
        .get("/:id/files/:file", (c) => {
            const { name, path } = kanban.file(id(c.req.param("id")), id(c.req.param("file")));
            return new Response(Bun.file(path), { headers: { "content-disposition": `attachment; filename="${encodeURIComponent(name)}"` } });
        })
        .delete("/:id/files/:file", (c) => c.json(mutate(() => kanban.removeFile(id(c.req.param("id")), id(c.req.param("file"))))));
}
