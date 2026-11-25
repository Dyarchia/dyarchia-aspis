import { useToast } from "@dyarchia/aspis";
import { Board, Terminal } from "@dyarchia/core";
import { useEffect, useState } from "react";
import { z } from "zod";
import { request } from "./server.ts";
import type { ServerState } from "./use-server.ts";

/*
 * The project folders the Kanban knows, archived ones left out, and the terminal sessions running in them. Sessions
 * belong to the server, so both lists are read again whenever it reports a change: a shell that exits disappears.
 */
export function useProjects({ conn, changes }: ServerState) {
    const toast = useToast();
    const [projects, setProjects] = useState<Board[]>([]);
    const [sessions, setSessions] = useState<Terminal[]>([]);

    useEffect(() => {
        if (!conn) return;
        void request(conn, "/boards", z.array(Board))
            .then((boards) => setProjects(boards.filter((board) => !board.archived)))
            .catch(() => undefined);
        void request(conn, "/terminals", z.array(Terminal))
            .then(setSessions)
            .catch(() => undefined);
    }, [conn, changes]);

    const fail = (reason: unknown) => {
        toast({ text: reason instanceof Error ? reason.message : String(reason), tone: "danger" });
        return undefined;
    };

    return {
        projects,
        sessions,
        open: async (board: number) => {
            if (!conn) return undefined;
            const session = await request(conn, "/terminals", Terminal, { method: "POST", body: JSON.stringify({ board }) }).catch(fail);
            if (session) setSessions((current) => [...current.filter((entry) => entry.id !== session.id), session]);
            return session;
        },
        close: async (id: string) => {
            if (!conn) return;
            setSessions((current) => current.filter((entry) => entry.id !== id));
            await request(conn, `/terminals/${id}`, z.null(), { method: "DELETE" }).catch(() => undefined);
        },
    };
}
