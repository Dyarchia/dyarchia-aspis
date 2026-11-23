import { Board } from "@dyarchia/core";
import { useEffect, useState } from "react";
import { z } from "zod";
import { request } from "./server.ts";
import type { ServerState } from "./use-server.ts";

/* The project folders the Kanban knows, archived ones left out, refreshed whenever the server reports a change. */
export function useProjects({ conn, changes }: ServerState) {
    const [projects, setProjects] = useState<Board[]>([]);
    useEffect(() => {
        if (!conn) return;
        void request(conn, "/boards", z.array(Board))
            .then((boards) => setProjects(boards.filter((board) => !board.archived)))
            .catch(() => undefined);
    }, [conn, changes]);
    return projects;
}
