import { useToast } from "@dyarchia/aspis";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { request } from "./server.ts";
import type { ServerState } from "./use-server.ts";

const PullRequest = z.object({ url: z.string(), state: z.enum(["OPEN", "MERGED", "CLOSED"]) });
const RepoStatus = z.object({
    path: z.string(),
    remote: z.string().nullable(),
    branch: z.string(),
    base: z.string(),
    changes: z.array(z.object({ path: z.string(), status: z.enum(["added", "modified", "deleted"]) })),
    pr: PullRequest.nullable(),
});
const LibraryState = z.object({ repo: z.string().nullable(), status: RepoStatus.nullable() });
export type LibraryState = z.infer<typeof LibraryState>;
export type PullRequest = z.infer<typeof PullRequest>;

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

/* The library repository: where it is, what changed, and the publish cycle (feature branch, pull request, sync). */
export function useLibrary({ conn, changes }: ServerState) {
    const toast = useToast();
    const [state, setState] = useState<LibraryState>();
    const [files, setFiles] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);

    const reload = useCallback(async () => {
        if (!conn) return;
        const next = await request(conn, "/library", LibraryState);
        const listed = next.status ? await request(conn, "/library/files", z.array(z.string())) : [];
        setState(next);
        setFiles(listed);
    }, [conn]);

    useEffect(() => {
        void reload().catch(() => undefined);
    }, [reload, changes]);

    const act = async <T>(action: () => Promise<T>, done?: (result: T) => string): Promise<T | undefined> => {
        setBusy(true);
        try {
            const result = await action();
            if (done) toast({ text: done(result), tone: "ok" });
            await reload();
            return result;
        } catch (reason) {
            toast({ text: reason instanceof Error ? reason.message : String(reason), tone: "danger" });
            return undefined;
        } finally {
            setBusy(false);
        }
    };

    const api = <S extends z.ZodType>(path: string, schema: S, init?: RequestInit) => {
        if (!conn) throw new Error("The local server is not connected");
        return request(conn, path, schema, init);
    };

    return {
        ...state,
        loaded: state !== undefined,
        files,
        busy,
        reload,
        connect: (repo: string) => act(() => api("/library/connect", LibraryState, json("POST", { repo })), () => `Library ${repo} is ready`),
        read: (path: string) => api(`/library/file?path=${encodeURIComponent(path)}`, z.object({ path: z.string(), text: z.string() })).then((file) => file.text),
        write: (path: string, text: string) => act(() => api("/library/file", z.null(), json("PUT", { path, text }))),
        remove: (path: string) => act(() => api(`/library/file?path=${encodeURIComponent(path)}`, z.null(), { method: "DELETE" })),
        publish: (message: string) => act(() => api("/library/publish", PullRequest, json("POST", { message })), (pr) => `Pull request ready for your merge: ${pr.url}`),
        sync: () => act(() => api("/library/sync", RepoStatus, { method: "POST" }), () => "Back on develop with the merged pieces"),
    };
}

export type Library = ReturnType<typeof useLibrary>;
