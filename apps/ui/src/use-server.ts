import { applyTheme } from "@dyarchia/aspis";
import { Health, Settings, Theme } from "@dyarchia/core";
import { useCallback, useEffect, useState } from "react";
import { readHint, writeHint } from "./hints.ts";
import { type Connection, connect, request, subscribe } from "./server.ts";

export interface ServerState {
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

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;
        let cancelled = false;
        const fail = (reason: unknown) => setError(String(reason));
        connect()
            .then((connection) => {
                if (cancelled) return;
                setConn(connection);
                /*
                 * The socket opens first and every hello (first connect and each reconnect) triggers a full
                 * re-read, so a change made between reading and subscribing can never be missed.
                 */
                unsubscribe = subscribe(
                    connection,
                    (event) => {
                        if (event.type === "settings") return setSettings(event.settings);
                        setDataVersion(event.dataVersion);
                        if (event.type === "hello") void request(connection, "/health", Health).then(setHealth, fail);
                        void request(connection, "/settings", Settings).then(setSettings, fail);
                    },
                    setLive,
                );
            })
            .catch(fail);
        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, []);

    useEffect(() => {
        applyTheme(settings.theme);
        writeHint("theme", settings.theme);
    }, [settings.theme]);

    const setTheme = useCallback(
        async (theme: Theme) => {
            setSettings((current) => ({ ...current, theme }));
            if (conn) setSettings(await request(conn, "/settings", Settings, { method: "PUT", body: JSON.stringify({ theme }) }));
        },
        [conn],
    );

    return { health, settings, live, dataVersion, error, setTheme };
}
