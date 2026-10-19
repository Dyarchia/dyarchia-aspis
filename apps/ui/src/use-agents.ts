import { useToast } from "@dyarchia/aspis";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { request } from "./server.ts";
import type { ServerState } from "./use-server.ts";

const AgentStatus = z.object({ harness: z.string(), cli: z.boolean(), installed: z.boolean() });
const AgentList = z.object({ installable: z.boolean(), agents: z.array(AgentStatus) });
export type AgentStatus = z.infer<typeof AgentStatus>;

export function useAgents({ conn, changes }: ServerState) {
    const toast = useToast();
    const [state, setState] = useState<z.infer<typeof AgentList>>();
    const [busy, setBusy] = useState<string>();

    const load = useCallback(async () => {
        if (conn) setState(await request(conn, "/agents", AgentList));
    }, [conn]);

    useEffect(() => {
        void load().catch(() => undefined);
    }, [load, changes]);

    const change = async (harness: AgentStatus["harness"], install: boolean) => {
        if (!conn) return;
        setBusy(harness);
        try {
            await request(conn, `/agents/${harness}`, z.array(AgentStatus), { method: install ? "POST" : "DELETE" });
            toast({ text: install ? `${harness} can pick up cards now. Restart its open sessions.` : `${harness} is no longer wired to the board.`, tone: "ok" });
            await load();
        } catch (reason) {
            toast({ text: reason instanceof Error ? reason.message : String(reason), tone: "danger" });
        } finally {
            setBusy(undefined);
        }
    };

    return { ...state, busy, install: (harness: AgentStatus["harness"]) => change(harness, true), remove: (harness: AgentStatus["harness"]) => change(harness, false) };
}
