import { EmptyState, IconButton, Page } from "@dyarchia/aspis";
import type { Board } from "@dyarchia/core";
import { Terminal } from "./Terminal.tsx";

export interface Session {
    id: string;
    board: number;
    label: string;
}

/*
 * Projects are the Kanban's project folders. A + on one opens a terminal session in it; sessions live while the app
 * is open and are listed under their project in the sidebar. The open session fills the pane.
 */
export function Projects({
    projects,
    sessions,
    current,
    onClose,
    onRoot,
}: {
    projects: readonly Board[];
    sessions: readonly Session[];
    current?: string;
    onClose: (id: string) => void;
    onRoot: () => void;
}) {
    const session = sessions.find((entry) => entry.id === current);
    const project = projects.find((entry) => entry.id === session?.board);

    if (!session || !project)
        return (
            <Page title="Projects">
                <EmptyState title={projects.length === 0 ? "Add a project from the Kanban first" : "Open a session with + on a project"} />
            </Page>
        );

    return (
        <Page title={session.label} crumbs={[{ label: "Projects", onClick: onRoot }, { label: project.name, onClick: onRoot }]} actions={<IconButton icon="close" label={`Close ${session.label}`} onClick={() => onClose(session.id)} />}>
            <Terminal key={session.id} project={project.name} label={`${project.name} ${session.label}`} />
        </Page>
    );
}
