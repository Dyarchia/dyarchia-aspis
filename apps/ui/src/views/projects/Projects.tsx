import { EmptyState, IconButton, Page } from "@dyarchia/aspis";
import type { Board, Terminal as Session } from "@dyarchia/core";
import type { Connection } from "../../server.ts";
import { Terminal } from "./Terminal.tsx";

/*
 * Projects are the Kanban's project folders. A + on one opens a terminal session in it, running the console chosen
 * in Settings; sessions are listed under their project in the sidebar and the open one fills the pane.
 */
export function Projects({
    conn,
    projects,
    sessions,
    current,
    onClose,
    onRoot,
}: {
    conn?: Connection;
    projects: readonly Board[];
    sessions: readonly Session[];
    current?: string;
    onClose: (id: string) => void;
    onRoot: () => void;
}) {
    const session = sessions.find((entry) => entry.id === current);
    const project = projects.find((entry) => entry.id === session?.board);

    if (!conn || !session || !project)
        return (
            <Page title="Projects">
                <EmptyState title={projects.length === 0 ? "Add a project from the Kanban first" : "Open a session with + on a project"} />
            </Page>
        );

    return (
        <Page title={session.label} crumbs={[{ label: "Projects", onClick: onRoot }, { label: project.name, onClick: onRoot }]} actions={<IconButton icon="close" label={`Close ${session.label}`} onClick={() => onClose(session.id)} />}>
            <Terminal key={session.id} conn={conn} id={session.id} label={`${project.name} ${session.label}`} />
        </Page>
    );
}
