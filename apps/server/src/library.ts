import { kinds, pieceAt, validate } from "@dyarchia/library";
import { LibraryError, LibraryRepo } from "@dyarchia/library/repo";
import { KanbanError, type Store, aspisHome } from "@dyarchia/store";
import { Hono } from "hono";
import { join } from "node:path";
import { z } from "zod";

const Connect = z.object({ repo: z.string().trim().regex(/^[\w.-]+\/[\w.-]+$/, "Write the repository as owner/name") });
const FileBody = z.object({ path: z.string().min(1), text: z.string() });
const Publish = z.object({ message: z.string().trim().min(1, "Describe the change") });

/*
 * The library repository the user chose lives under ~/.dyarchia-aspis/library/<name>. ASPIS_LIBRARY points it at
 * another folder and ASPIS_GH replaces the GitHub CLI, so development and e2e never reach GitHub.
 */
/* Every piece touched by the unpublished changes, checked as Build checks it: errors stop the publish. */
async function problems(repo: LibraryRepo): Promise<string[]> {
    const touched = new Map<string, { kind: keyof typeof kinds; name: string }>();
    for (const change of await repo.changes()) {
        const at = pieceAt(change.path);
        if (at) touched.set(`${at.kind}/${at.name}`, at);
    }
    const files = repo.files();
    const found: string[] = [];
    for (const { kind: id, name } of touched.values()) {
        const kind = kinds[id];
        const main = kind.main(name);
        const owned = files.filter((file) => kind.owns(file) === name);
        if (owned.length === 0) continue;
        if (!owned.includes(main)) {
            found.push(`${id}/${name}: ${main} is missing`);
            continue;
        }
        const issues = validate(kind, { kind: id, name, path: main, text: repo.read(main), files: owned });
        for (const issue of issues.filter((issue) => issue.level === "error")) found.push(`${id}/${name}: ${issue.message}`);
    }
    return found;
}

export function libraryRoutes(store: Store, changed: () => void) {
    const repoName = () => store.getSetting("library.repo");
    const open = (name = repoName()) => {
        if (!name) throw new KanbanError("Choose the library repository in Settings first", 409);
        const path = process.env.ASPIS_LIBRARY ?? join(aspisHome(), "library", name.split("/")[1]!);
        return new LibraryRepo({ path, gh: process.env.ASPIS_GH ? JSON.parse(process.env.ASPIS_GH) : undefined });
    };
    const guard = async <T>(action: () => Promise<T> | T): Promise<T> => {
        try {
            return await action();
        } catch (error) {
            if (error instanceof LibraryError) throw new KanbanError(error.message, 409);
            throw error;
        }
    };

    return new Hono()
        .get("/", async (c) => {
            const name = repoName();
            if (!name) return c.json({ repo: null, status: null });
            const repo = open(name);
            return c.json({ repo: name, status: repo.exists ? await guard(() => repo.status()) : null });
        })
        .post("/connect", async (c) => {
            const { repo: name } = Connect.parse(await c.req.json());
            const repo = open(name);
            await guard(() => repo.connect(name));
            store.setSetting("library.repo", name);
            changed();
            return c.json({ repo: name, status: await guard(() => repo.status()) });
        })
        .get("/files", (c) => c.json(open().files()))
        .get("/file", async (c) => {
            const path = c.req.query("path") ?? "";
            return c.json({ path, text: await guard(() => open().read(path)) });
        })
        .put("/file", async (c) => {
            const { path, text } = FileBody.parse(await c.req.json());
            await guard(() => open().write(path, text));
            return c.body(null, 204);
        })
        .delete("/file", async (c) => {
            await guard(() => open().remove(c.req.query("path") ?? ""));
            return c.body(null, 204);
        })
        .post("/publish", async (c) => {
            const { message } = Publish.parse(await c.req.json());
            const repo = open();
            const blocking = await problems(repo);
            if (blocking.length > 0) throw new KanbanError(`Fix these before publishing: ${blocking.join("; ")}`, 409);
            return c.json(await guard(() => repo.publish(message)));
        })
        .post("/sync", async (c) => c.json(await guard(() => open().sync())));
}
