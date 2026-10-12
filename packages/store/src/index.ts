import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const migrations = [
    `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
     CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
     INSERT INTO meta (key, value) VALUES ('created_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`,
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
