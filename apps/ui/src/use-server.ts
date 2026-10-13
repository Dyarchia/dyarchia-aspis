import { applyTheme } from "@dyarchia/aspis";
import { Health, Settings, Theme } from "@dyarchia/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { readHint, writeHint } from "./hints.ts";
import { type Connection, connect, request, subscribe } from "./server.ts";

export interface ServerState {
    conn?: Connection;
    changes: number;
    health?: Health;
    settings: Settings;
    live: boolean;
    dataVersion?: number;
    error?: string;
    setTheme: (theme: Theme) => Promise<void>;
}

export function useServer(): ServerState {
    const [conn, setConn] = useState<Connection>();
    const [health, setHealth] = useState<Health>();
    const [settings, setSettings] = useState<Settings>(() => ({ theme: Theme.catch("io").parse(readHint("theme")) }));
    const [live, setLive] = useState(false);
    const [dataVersion, setDataVersion] = useState<number>();
    const [error, setError] = useState<string>();
    const [changes, setChanges] = useState(0);
    const revision = useRef(0);

    /*
     * Every source of settings (hello, a pushed event, a re-read, the answer to our own write) bumps or checks
     * the revision, so an answer that left before a newer value arrived can never overwrite it.
     */
    const accept = useCallback((next: Settings) => {
        revision.current++;
        setSettings(next);
    }, []);
    const reread = useCallback((connection: Connection) => {
        const at = revision.current;
        return request(connection, "/settings", Settings).then((next) => {
            if (revision.current === at) accept(next);
        });
    }, [accept]);

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;
        let cancelled = false;
        const fail = (reason: unknown) => setError(String(reason));
        connect()
            .then((connection) => {
                if (cancelled) return;
                setConn(connection);
                unsubscribe = subscribe(
                    connection,
                    (event) => {
                        if (event.type === "settings") return accept(event.settings);
                        setDataVersion(event.dataVersion);
                        setChanges((count) => count + 1);
                        if (event.type === "hello") {
                            accept(event.settings);
                            void request(connection, "/health", Health).then(setHealth, fail);
                        } else {
                            void reread(connection).catch(fail);
                        }
                    },
                    setLive,
                );
            })
            .catch(fail);
        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [accept, reread]);

    useEffect(() => {
        applyTheme(settings.theme);
        writeHint("theme", settings.theme);
    }, [settings.theme]);

    const setTheme = useCallback(
        async (theme: Theme) => {
            accept({ ...settings, theme });
            if (!conn) return;
            const at = revision.current;
            const saved = await request(conn, "/settings", Settings, { method: "PUT", body: JSON.stringify({ theme }) });
            if (revision.current === at) accept(saved);
        },
        [conn, settings, accept],
    );

    return { conn, changes, health, settings, live, dataVersion, error, setTheme };
}
