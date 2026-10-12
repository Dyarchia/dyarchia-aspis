import { Health } from "@dyarchia/core";
import { useEffect, useState } from "react";
import { connect, request, subscribe } from "./server.ts";

export function App() {
    const [health, setHealth] = useState<Health>();
    const [live, setLive] = useState(false);
    const [dataVersion, setDataVersion] = useState<number>();
    const [error, setError] = useState<string>();

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;
        connect()
            .then(async (conn) => {
                setHealth(await request(conn, "/health", Health));
                unsubscribe = subscribe(conn, (event) => setDataVersion(event.dataVersion), setLive);
            })
            .catch((e: unknown) => setError(String(e)));
        return () => unsubscribe?.();
    }, []);

    const rows: [string, string][] = health
        ? [
              ["VERSION", health.version],
              ["SCHEMA", String(health.schemaVersion)],
              ["STATE", health.dbPath],
              ["PID", String(health.pid)],
              ["STARTED", new Date(health.startedAt).toLocaleString()],
              ["DATA VERSION", dataVersion === undefined ? "..." : String(dataVersion)],
          ]
        : [];

    return (
        <main className="status">
            <h1 className="wordmark">dyarchia aspis</h1>
            <p className="subtitle">Local server status</p>
            <div className="state">
                <span className={live ? "dot live" : "dot"} />
                {error ? `ERROR ${error}` : live ? "SERVER LIVE" : "CONNECTING"}
            </div>
            <dl className="rows">
                {rows.map(([term, value]) => (
                    <div key={term}>
                        <dt>{term}</dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
        </main>
    );
}
