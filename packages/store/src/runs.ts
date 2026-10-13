import type { Run, RunStatus } from "@dyarchia/core";
import { dirname, join } from "node:path";
import type { Store } from "./index.ts";
import { KanbanError } from "./kanban.ts";

interface RunRow {
    id: number;
    card_id: number;
    attempt: number;
    status: RunStatus;
    branch: string;
    pid: number | null;
    started_at: number;
    heartbeat_at: number;
    ended_at: number | null;
    error: string | null;
    stop_requested: number;
}

/*
 * A runner beats every few seconds while its harness works. A run whose beat is older than this is treated as
 * dead (machine slept, process killed) and the dispatcher fails it so the card can be retried.
 */
export const staleAfterMs = 90_000;

export class Runs {
    readonly dir: string;

    constructor(private readonly store: Store) {
        this.dir = join(dirname(store.path), "runs");
    }

    private get db() {
        return this.store.db;
    }

    list(cardId: number, now = Date.now()): Run[] {
        return this.db
            .query<RunRow, [number]>("SELECT * FROM runs WHERE card_id = ? ORDER BY id DESC")
            .all(cardId)
            .map((row) => this.hydrate(row, now));
    }

    get(id: number, now = Date.now()): Run {
        const row = this.db.query<RunRow, [number]>("SELECT * FROM runs WHERE id = ?").get(id);
        if (!row) throw new KanbanError(`Run ${id} does not exist`, 404);
        return this.hydrate(row, now);
    }

    live(cardId: number, now = Date.now()): Run | undefined {
        return this.list(cardId, now).find((run) => run.live);
    }

    busy(folder: string, now = Date.now()): boolean {
        return Boolean(
            this.db
                .query("SELECT 1 FROM runs JOIN cards ON cards.id = runs.card_id WHERE cards.folder = ? AND runs.status = 'running' AND runs.heartbeat_at > ?")
                .get(folder, now - staleAfterMs),
        );
    }

    start(cardId: number, branch: string, now = Date.now()): Run {
        const attempt = this.db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM runs WHERE card_id = ?").get(cardId)!.n + 1;
        const id = Number(
            this.db
                .query("INSERT INTO runs (card_id, attempt, status, branch, started_at, heartbeat_at) VALUES (?, ?, 'running', ?, ?, ?)")
                .run(cardId, attempt, branch, now, now).lastInsertRowid,
        );
        return this.get(id, now);
    }

    attach(id: number, pid: number): void {
        this.db.query("UPDATE runs SET pid = ? WHERE id = ?").run(pid, id);
    }

    beat(id: number, now = Date.now()): void {
        this.db.query("UPDATE runs SET heartbeat_at = ? WHERE id = ? AND status = 'running'").run(now, id);
    }

    finish(id: number, status: Exclude<RunStatus, "running">, error: string | null, now = Date.now()): void {
        this.db.query("UPDATE runs SET status = ?, error = ?, ended_at = ? WHERE id = ?").run(status, error, now, id);
    }

    requestStop(cardId: number, now = Date.now()): boolean {
        const run = this.live(cardId, now);
        if (!run) return false;
        this.db.query("UPDATE runs SET stop_requested = 1 WHERE id = ?").run(run.id);
        return true;
    }

    stopRequested(id: number): boolean {
        return this.db.query<{ stop_requested: number }, [number]>("SELECT stop_requested FROM runs WHERE id = ?").get(id)?.stop_requested === 1;
    }

    /* Failed attempts since the card last entered Running: the budget its retries count against. */
    failures(cardId: number): number {
        return this.db
            .query<{ n: number }, [number]>(
                `SELECT COUNT(*) AS n FROM runs WHERE card_id = ?1 AND status = 'failed' AND started_at >= COALESCE(
                     (SELECT MAX(at) FROM card_events WHERE card_id = ?1 AND kind = 'moved' AND to_phase = 'running'), 0)`,
            )
            .get(cardId)!.n;
    }

    reap(now = Date.now()): number {
        return this.db
            .query("UPDATE runs SET status = 'failed', error = 'The runner stopped answering', ended_at = ? WHERE status = 'running' AND heartbeat_at <= ?")
            .run(now, now - staleAfterMs).changes;
    }

    logPath(run: Pick<Run, "id" | "cardId">): string {
        return join(this.dir, String(run.cardId), `${run.id}.log`);
    }

    private hydrate(row: RunRow, now: number): Run {
        return {
            id: row.id,
            cardId: row.card_id,
            attempt: row.attempt,
            status: row.status,
            branch: row.branch,
            startedAt: row.started_at,
            endedAt: row.ended_at,
            error: row.error,
            live: row.status === "running" && row.heartbeat_at > now - staleAfterMs,
        };
    }
}
