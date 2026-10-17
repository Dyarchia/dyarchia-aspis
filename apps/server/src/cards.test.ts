import { afterAll, expect, test } from "bun:test";
import { Board, Card } from "@dyarchia/core";
import { Runs, Store } from "@dyarchia/store";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { actorRoutes } from "./actors.ts";
import { startServer } from "./app.ts";

const dir = mkdtempSync(join(tmpdir(), "aspis-cards-"));
const store = new Store(join(dir, "state.db"));
const shipped = startServer({ store, token: "t", hostname: "127.0.0.1", port: 0 });
const dev = startServer({ store, token: "t", hostname: "127.0.0.1", port: 0, actors: actorRoutes });
const headers = { authorization: "Bearer t", "content-type": "application/json" };
const call = (server: typeof shipped, path: string, method = "GET", body?: unknown) =>
    fetch(`http://127.0.0.1:${server.server.port}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
const read = async <T>(response: Response) => (await response.json()) as T;
const runner = { harness: "claude-code", model: "claude-opus-5-5", effort: "high" };
const board = Board.parse(await (await call(shipped, "/boards", "POST", { name: "Repo", folder: join(dir, "repo") })).json()).id;

afterAll(() => {
    shipped.stop();
    dev.stop();
    store.close();
    Bun.gc(true);
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
});

test("cards are created, edited and moved only where the rules allow", async () => {
    const created = Card.parse(await (await call(shipped, "/cards", "POST", { title: "Write callout tests", board })).json());
    expect(created.phase).toBe("triage");

    const refused = await call(shipped, `/cards/${created.id}/move`, "POST", { to: "ready" });
    expect(refused.status).toBe(409);
    expect((await read<{ error: string }>(refused)).error).toContain("brief");

    await call(shipped, `/cards/${created.id}`, "PATCH", { brief: "Cover the retry path", implementer: runner, auditor: runner });
    expect((await call(shipped, `/cards/${created.id}/move`, "POST", { to: "ready" })).status).toBe(200);
    expect((await call(shipped, `/cards/${created.id}/move`, "POST", { to: "running", sessionId: "s" })).status).toBe(409);

    const detail = await read<{ targets: { to: string }[]; events: { kind: string }[] }>(await call(shipped, `/cards/${created.id}`));
    expect(detail.targets.map((target) => target.to)).toEqual(["scheduled", "triage"]);
    expect(detail.events.map((event) => event.kind)).toEqual(["created", "edited", "moved"]);
});

test("the shipped server has no actor routes and the dev one acts through the same rules", async () => {
    const card = Card.parse(await (await call(shipped, "/cards", "POST", { title: "Pick me", board })).json());
    await call(shipped, `/cards/${card.id}`, "PATCH", { brief: "x", implementer: runner, auditor: runner });
    await call(shipped, `/cards/${card.id}/move`, "POST", { to: "ready" });

    expect((await call(shipped, `/dev/cards/${card.id}/move`, "POST", { to: "running", actor: "agent", sessionId: "s" })).status).toBe(404);
    expect((await read<{ dev: boolean }>(await call(shipped, "/health"))).dev).toBe(false);
    expect((await read<{ dev: boolean }>(await call(dev, "/health"))).dev).toBe(true);

    expect((await call(dev, `/dev/cards/${card.id}/move`, "POST", { to: "review", actor: "agent", note: "x" })).status).toBe(409);
    expect((await call(dev, `/dev/cards/${card.id}/move`, "POST", { to: "running", actor: "agent", sessionId: "s" })).status).toBe(200);
});

test("files go up as form data and come back as they were", async () => {
    const card = Card.parse(await (await call(shipped, "/cards", "POST", { title: "With a file", board })).json());
    const form = new FormData();
    form.append("file", new File(["# Spec"], "spec.md"));
    const uploaded = Card.parse(
        await (await fetch(`http://127.0.0.1:${shipped.server.port}/cards/${card.id}/files`, { method: "POST", headers: { authorization: "Bearer t" }, body: form })).json(),
    );
    const [file] = uploaded.files;
    const download = await call(shipped, `/cards/${card.id}/files/${file!.id}`);
    expect(await download.text()).toBe("# Spec");
    expect(download.headers.get("content-disposition")).toContain("spec.md");
});

test("a run's log is served whole lines at a time and only running scheduled cards stop", async () => {
    const card = Card.parse(await (await call(shipped, "/cards", "POST", { title: "Logged", board })).json());
    const runs = new Runs(store);
    const run = runs.start(card.id, "feature/develop/card-logged");
    mkdirSync(dirname(runs.logPath(run)), { recursive: true });
    writeFileSync(runs.logPath(run), '{"type":"aspis","text":"one"}\n{"type":"aspis","te');

    expect((await read<{ id: number; live: boolean }[]>(await call(shipped, `/cards/${card.id}/runs`))).map((entry) => [entry.id, entry.live])).toEqual([[run.id, true]]);
    const first = await read<{ text: string; next: number }>(await call(shipped, `/cards/${card.id}/runs/${run.id}/log`));
    expect(first.text).toBe('{"type":"aspis","text":"one"}\n');
    const rest = await read<{ text: string; next: number; live: boolean }>(await call(shipped, `/cards/${card.id}/runs/${run.id}/log?from=${first.next}`));
    expect(rest).toEqual({ text: "", next: first.next, live: true });
    expect((await call(shipped, `/cards/${card.id + 1000}/runs/${run.id}/log`)).status).toBe(404);

    const stop = await call(shipped, `/cards/${card.id}/stop`, "POST");
    expect(stop.status).toBe(409);
});

test("a board is a project: one per folder, archived boards take no cards, deleting one keeps the folder", async () => {
    const folder = join(dir, "project");
    const project = Board.parse(await (await call(shipped, "/boards", "POST", { name: "Project", folder })).json());
    expect(existsSync(folder)).toBe(true);
    expect((await call(shipped, "/boards", "POST", { name: "project", folder: dir })).status).toBe(409);
    expect(await read(await call(shipped, `/boards/folder?name=site&folder=${encodeURIComponent(dir)}`))).toEqual({ folder: join(dir, "site"), exists: false });
    expect((await call(shipped, "/boards", "POST", { name: "Relative", folder: "repos/x" })).status).toBe(400);

    const card = Card.parse(await (await call(shipped, "/cards", "POST", { title: "On the project", board: project.id })).json());
    expect(card.folder).toBe(folder);

    const archived = Board.parse(await (await call(shipped, `/boards/${project.id}`, "PATCH", { archived: true })).json());
    expect(archived.archived).toBe(true);
    expect((await call(shipped, "/cards", "POST", { title: "Refused", board: project.id })).status).toBe(409);

    expect((await call(shipped, `/boards/${project.id}`, "DELETE")).status).toBe(204);
    expect((await call(shipped, `/cards/${card.id}`)).status).toBe(404);
    expect(existsSync(folder)).toBe(true);
    expect((await read<Board[]>(await call(shipped, "/boards"))).map((entry) => entry.id)).not.toContain(project.id);
});
