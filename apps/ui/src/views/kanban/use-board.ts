import { useToast } from "@dyarchia/aspis";
import { type Actor, Board, type BoardDraft, type BoardEdit, Card, CardDetail, type CardEdit, CardEvent, type MoveRequest, Run, RunLog } from "@dyarchia/core";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { request } from "../../server.ts";
import type { ServerState } from "../../use-server.ts";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export function useBoard(server: ServerState) {
    const { conn, changes } = server;
    const toast = useToast();
    const [cards, setCards] = useState<Card[]>();
    const [boards, setBoards] = useState<Board[]>();

    useEffect(() => {
        if (!conn) return;
        let stale = false;
        void Promise.all([request(conn, "/boards", z.array(Board)), request(conn, "/cards", z.array(Card))]).then(([nextBoards, nextCards]) => {
            if (stale) return;
            setBoards(nextBoards);
            setCards(nextCards);
        });
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
        boards,
        cards,
        run,
        createBoard: (draft: BoardDraft) => run(() => api("/boards", Board, json("POST", draft))),
        editBoard: (id: number, edit: BoardEdit) => run(() => api(`/boards/${id}`, Board, json("PATCH", edit))),
        removeBoard: (id: number) => run(() => api(`/boards/${id}`, z.null(), { method: "DELETE" })),
        projectPath: (name: string, folder: string) =>
            api(`/boards/folder?${new URLSearchParams({ name, folder })}`, z.object({ folder: z.string(), exists: z.boolean() })).catch(() => undefined),
        detail: (id: number) => api(`/cards/${id}`, CardDetail),
        create: (title: string, board: number) => run(() => api("/cards", Card, json("POST", { title, board }))),
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
        runs: (id: number) => api(`/cards/${id}/runs`, z.array(Run)),
        log: (id: number, run: number, from: number) => api(`/cards/${id}/runs/${run}/log?from=${from}`, RunLog),
        retryAudit: (id: number) => run(() => api(`/cards/${id}/audit`, z.null(), { method: "POST" })),
        stop: (id: number) => run(() => api(`/cards/${id}/stop`, z.null(), { method: "POST" })),
        dispatch: () => run(() => api("/dev/dispatch", z.object({ started: z.array(z.number()) }), { method: "POST" })),
        act: (id: number, actor: Actor, move: MoveRequest) => run(() => api(`/dev/cards/${id}/move`, Card, json("POST", { ...move, actor }))),
        audit: (id: number, ok: boolean, reason: string) => run(() => api(`/dev/cards/${id}/verdict`, Card, json("POST", { ok, reason }))),
    };
}

export type BoardApi = ReturnType<typeof useBoard>;
