import { type Health, type ServerEvent, Settings, readSettings } from "@dyarchia/core";
import { Desktop } from "@dyarchia/runner";
import { Kanban, KanbanError, Runs, type Store } from "@dyarchia/store";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import pkg from "../../../package.json" with { type: "json" };
import { agentRoutes } from "./agents.ts";
import { boardRoutes, cardRoutes } from "./cards.ts";
import { libraryRoutes } from "./library.ts";
import { runRoutes } from "./runs.ts";

const allowedOrigins = ["http://tauri.localhost", "https://tauri.localhost", "tauri://localhost", "http://localhost:1420"];

export interface ExtensionContext {
    store: Store;
    kanban: Kanban;
    changed: () => void;
}

export type Extension = (context: ExtensionContext) => Hono;

export interface ServerOptions {
    store: Store;
    token: string;
    hostname: string;
    port: number;
    actors?: Extension;
}

export function startServer({ store, token, hostname, port, actors }: ServerOptions) {
    const startedAt = new Date().toISOString();
    const authorized = (req: Request) =>
        req.headers.get("authorization") === `Bearer ${token}` || new URL(req.url).searchParams.get("token") === token;
    const publish = (event: ServerEvent) => server.publish("events", JSON.stringify(event));
    const settings = () => readSettings((key) => store.getSetting(key));
    /*
     * Every change to the board, made here or by any other process, may move a Scheduled card's time or leave work
     * due now, so Task Scheduler is brought in line with the board shortly after things settle.
     */
    const desktop = new Desktop({ store });
    let settle: ReturnType<typeof setTimeout> | undefined;
    const reschedule = () => {
        clearTimeout(settle);
        settle = setTimeout(() => void desktop.sync().catch(() => undefined), 800);
    };
    const changed = () => {
        publish({ type: "changed", dataVersion: store.dataVersion });
        reschedule();
    };
    const kanban = new Kanban(store);
    const runs = new Runs(store);
    const dev = Boolean(actors);

    const app = new Hono()
        .use("*", cors({ origin: allowedOrigins, allowHeaders: ["authorization", "content-type"], allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }))
        .use("*", async (c, next) => {
            if (!authorized(c.req.raw)) return c.json({ error: "unauthorized" }, 401);
            await next();
        })
        .get("/health", (c) =>
            c.json<Health>({
                ok: true,
                version: pkg.version,
                schemaVersion: store.schemaVersion,
                dbPath: store.path,
                pid: process.pid,
                startedAt,
                dev,
                lastDispatch: Number(store.getMeta("dispatch.last")) || null,
            }),
        )
        .get("/settings", (c) => c.json(settings()))
        .put("/settings", async (c) => {
            const patch = Settings.partial().safeParse(await c.req.json().catch(() => undefined));
            if (!patch.success) return c.json({ error: "invalid settings" }, 400);
            if (patch.data.theme) store.setSetting("theme", patch.data.theme);
            if (patch.data.maxRunning) store.setSetting("maxRunning", String(patch.data.maxRunning));
            const next = settings();
            publish({ type: "settings", settings: next });
            return c.json(next);
        })
        .route("/boards", boardRoutes(kanban, changed))
        .route("/cards", cardRoutes(kanban, changed))
        .route("/cards", runRoutes(kanban, runs, changed))
        .route("/agents", agentRoutes())
        .route("/library", libraryRoutes(store, changed))
        .onError((error, c) => {
            if (error instanceof KanbanError) return c.json({ error: error.message }, error.status);
            if (error instanceof ZodError) return c.json({ error: error.issues.map((issue) => issue.message).join("; ") }, 400);
            return c.json({ error: String(error) }, 500);
        });

    if (actors) app.route("/dev", actors({ store, kanban, changed }));

    const server = Bun.serve({
        hostname,
        port,
        fetch(req, srv) {
            if (new URL(req.url).pathname === "/ws") {
                if (!authorized(req)) return new Response("unauthorized", { status: 401 });
                return srv.upgrade(req) ? undefined : new Response("upgrade failed", { status: 400 });
            }
            return app.fetch(req);
        },
        websocket: {
            open(ws) {
                ws.subscribe("events");
                ws.send(JSON.stringify({ type: "hello", dataVersion: store.dataVersion, settings: settings() } satisfies ServerEvent));
            },
            message() {},
        },
    });

    const stopWatching = store.watch((dataVersion) => {
        publish({ type: "changed", dataVersion });
        reschedule();
    });
    void desktop
        .retire()
        .then(() => desktop.sync())
        .catch(() => undefined);

    return {
        server,
        stop() {
            stopWatching();
            clearTimeout(settle);
            server.stop(true);
        },
    };
}
