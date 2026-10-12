import { ServerEvent } from "@dyarchia/core";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { z } from "zod";

export interface Connection {
    base: string;
    token: string;
}

export async function connect(): Promise<Connection> {
    if (isTauri()) {
        const { port, token } = await invoke<{ port: number; token: string }>("server_info");
        return { base: `http://127.0.0.1:${port}`, token };
    }
    return {
        base: import.meta.env.VITE_ASPIS_URL ?? "http://127.0.0.1:4319",
        token: import.meta.env.VITE_ASPIS_TOKEN ?? "dev",
    };
}

export async function request<S extends z.ZodType>(conn: Connection, path: string, schema: S, init?: RequestInit): Promise<z.infer<S>> {
    const res = await fetch(`${conn.base}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${conn.token}`, "content-type": "application/json", ...init?.headers },
    });
    if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed with ${res.status}`);
    return schema.parse(await res.json());
}

export function subscribe(conn: Connection, onEvent: (event: ServerEvent) => void, onStatus: (live: boolean) => void): () => void {
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const open = () => {
        socket = new WebSocket(`${conn.base.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(conn.token)}`);
        socket.onopen = () => onStatus(true);
        socket.onmessage = (e) => onEvent(ServerEvent.parse(JSON.parse(String(e.data))));
        socket.onclose = () => {
            onStatus(false);
            if (!closed) retry = setTimeout(open, 1000);
        };
    };
    open();
    return () => {
        closed = true;
        clearTimeout(retry);
        socket?.close();
    };
}
