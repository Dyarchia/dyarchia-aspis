import { useToast } from "@dyarchia/aspis";
import { type Actor, Card, CardDetail, type CardEdit, CardEvent, type MoveRequest } from "@dyarchia/core";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { request } from "../../server.ts";
import type { ServerState } from "../../use-server.ts";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export function useBoard(server: ServerState) {
    const { conn, changes } = server;
    const toast = useToast();
    const [cards, setCards] = useState<Card[]>();

    useEffect(() => {
        if (!conn) return;
        let stale = false;
        void request(conn, "/cards", z.array(Card)).then((next) => !stale && setCards(next));
        return () => {
            stale = true;
        };
    }, [conn, changes]);

    const run = useCallback(
        async <T>(action: () => Promise<T>): Promise<T | undefined> => {
            try {
                return await action();
            } catch (reason) {
                toast({ text: reason instanceof Error ? reason.message : String(reason), tone: "danger" });
                return undefined;
            }
        },
        [toast],
    );

    const api = useCallback(
        <S extends z.ZodType>(path: string, schema: S, init?: RequestInit) => {
            if (!conn) throw new Error("The local server is not connected");
            return request(conn, path, schema, init);
        },
        [conn],
    );

    return {
        cards,
        run,
        detail: (id: number) => api(`/cards/${id}`, CardDetail),
        create: (title: string) => run(() => api("/cards", Card, json("POST", { title }))),
        edit: (id: number, edit: CardEdit) => run(() => api(`/cards/${id}`, Card, json("PATCH", edit))),
        move: (id: number, move: MoveRequest) => run(() => api(`/cards/${id}/move`, Card, json("POST", move))),
        note: (id: number, text: string) => run(() => api(`/cards/${id}/notes`, CardEvent, json("POST", { text }))),
        verdict: (id: number, ok: boolean, reason: string) => run(() => api(`/cards/${id}/verdict`, Card, json("POST", { ok, reason }))),
        remove: (id: number) => run(() => api(`/cards/${id}`, z.null(), { method: "DELETE" })),
        upload: (id: number, file: File) => {
            const form = new FormData();
            form.append("file", file);
            return run(() => api(`/cards/${id}/files`, Card, { method: "POST", body: form }));
        },
        removeFile: (id: number, file: number) => run(() => api(`/cards/${id}/files/${file}`, Card, { method: "DELETE" })),
        fileUrl: (id: number, file: number) => (conn ? `${conn.base}/cards/${id}/files/${file}?token=${encodeURIComponent(conn.token)}` : undefined),
        act: (id: number, actor: Actor, move: MoveRequest) => run(() => api(`/dev/cards/${id}/move`, Card, json("POST", { ...move, actor }))),
        audit: (id: number, ok: boolean, reason: string) => run(() => api(`/dev/cards/${id}/verdict`, Card, json("POST", { ok, reason }))),
    };
}

export type BoardApi = ReturnType<typeof useBoard>;
