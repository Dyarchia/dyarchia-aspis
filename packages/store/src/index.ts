import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const migrations = [
    `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
     CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
     INSERT INTO meta (key, value) VALUES ('created_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`,
    `CREATE TABLE cards (
         id INTEGER PRIMARY KEY,
         title TEXT NOT NULL,
         brief TEXT NOT NULL DEFAULT '',
         phase TEXT NOT NULL,
         route TEXT,
         priority INTEGER NOT NULL DEFAULT 0,
         folder TEXT,
         base_branch TEXT,
         permission TEXT NOT NULL DEFAULT 'auto',
         implementer TEXT NOT NULL,
         auditor TEXT NOT NULL,
         scheduled_at INTEGER,
         recurrence TEXT,
         time_limit_min INTEGER,
         retries INTEGER NOT NULL DEFAULT 2,
         session_id TEXT,
         auditor_verdict TEXT,
         human_verdict TEXT,
         blocked_reason TEXT,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
     );
     CREATE INDEX cards_phase ON cards (phase);
     CREATE TABLE card_dependencies (
         card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
         depends_on INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
         PRIMARY KEY (card_id, depends_on)
     );
     CREATE TABLE card_files (
         id INTEGER PRIMARY KEY,
         card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
         name TEXT NOT NULL,
         bytes INTEGER NOT NULL,
         at INTEGER NOT NULL
     );
     CREATE TABLE card_events (
         id INTEGER PRIMARY KEY,
         card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
         at INTEGER NOT NULL,
         actor TEXT NOT NULL,
         kind TEXT NOT NULL,
         from_phase TEXT,
         to_phase TEXT,
         text TEXT
     );
     CREATE INDEX card_events_card ON card_events (card_id, id);`,
    `ALTER TABLE cards ADD COLUMN held TEXT;
     CREATE TABLE runs (
         id INTEGER PRIMARY KEY,
         card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
         attempt INTEGER NOT NULL,
         status TEXT NOT NULL,
         branch TEXT NOT NULL,
         pid INTEGER,
         started_at INTEGER NOT NULL,
         heartbeat_at INTEGER NOT NULL,
         ended_at INTEGER,
         error TEXT,
         stop_requested INTEGER NOT NULL DEFAULT 0
     );
     CREATE INDEX runs_card ON runs (card_id, id);`,
    `ALTER TABLE runs ADD COLUMN kind TEXT NOT NULL DEFAULT 'headless';
     ALTER TABLE cards ADD COLUMN delivered INTEGER NOT NULL DEFAULT 0;
     CREATE INDEX cards_session ON cards (session_id);`,
];

export const aspisHome = () => process.env.ASPIS_HOME ?? join(homedir(), ".dyarchia-aspis");

export class Store {
    readonly db: Database;

    constructor(readonly path = join(aspisHome(), "state.db")) {
        mkdirSync(dirname(path), { recursive: true });
        this.db = new Database(path, { create: true, strict: true });
        this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
        this.migrate();
    }

    get schemaVersion(): number {
        return this.db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version;
    }

    /*
     * PRAGMA data_version only moves when another connection commits, so it is the signal that some other
     * process (another client, an agent hook) changed state.db. Writes made through this connection are
     * announced by the caller itself.
     */
    get dataVersion(): number {
        return this.db.query<{ data_version: number }, []>("PRAGMA data_version").get()!.data_version;
    }

    getSetting(key: string): string | undefined {
        return this.db.query<{ value: string }, [string]>("SELECT value FROM settings WHERE key = ?").get(key)?.value;
    }

    setSetting(key: string, value: string): void {
        this.db
            .query("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
            .run(key, value, Date.now());
    }

    getMeta(key: string): string | undefined {
        return this.db.query<{ value: string }, [string]>("SELECT value FROM meta WHERE key = ?").get(key)?.value;
    }

    setMeta(key: string, value: string): void {
        this.db.query("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
    }

    watch(onChange: (dataVersion: number) => void, intervalMs = 500): () => void {
        let last = this.dataVersion;
        const timer = setInterval(() => {
            const current = this.dataVersion;
            if (current !== last) {
                last = current;
                onChange(current);
            }
        }, intervalMs);
        return () => clearInterval(timer);
    }

    close(): void {
        this.db.close();
    }

    private migrate(): void {
        for (let version = this.schemaVersion; version < migrations.length; version++) {
            this.db.transaction(() => {
                this.db.exec(migrations[version]!);
                this.db.exec(`PRAGMA user_version = ${version + 1}`);
            })();
        }
    }
}
export * from "./kanban.ts";
export * from "./runs.ts";
