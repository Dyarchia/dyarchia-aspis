import { Button, Chip, List, ListRow, MetaTree, Page, PageHeader, Section, StatGrid, type Tone } from "@dyarchia/aspis";
import type { ServerState } from "../use-server.ts";

const sprints: { id: string; title: string; detail: string; state: string; tone: Tone }[] = [
    { id: "S0", title: "Foundation", detail: "Tauri shell, Bun sidecar, state.db, installer", state: "Shipped", tone: "ok" },
    { id: "S1", title: "Aspis", detail: "Design system, io and nyx, shared theme, self-update", state: "Shipped", tone: "ok" },
    { id: "S2", title: "Kanban", detail: "Board with its rules, panel, thread, sync under a second", state: "Shipped", tone: "ok" },
    { id: "S3", title: "Scheduled cards", detail: "Headless runs, Task Scheduler, queue per repo, live log", state: "Shipped", tone: "ok" },
    { id: "S4", title: "Ready cards", detail: "Pickup from any CLI, guard hook, MCP, auditor", state: "Shipped", tone: "ok" },
    { id: "S5", title: "Build", detail: "Library of agent pieces: tutorial, declarative and code", state: "Shipped", tone: "ok" },
];

export function Home({ server, onNavigate }: { server: ServerState; onNavigate: (view: "kanban" | "build" | "aspis" | "settings") => void }) {
    const { health } = server;
    return (
        <Page
            head={
                <PageHeader
                    title="Dyarchia Aspis"
                    explanation="The desktop for Build and Kanban."
                    lead="One local source of truth in state.db. Every client reads it, writes through the same library and repaints when it changes."
                    actions={
                        <>
                            <Button variant="primary" icon="shield" onClick={() => onNavigate("aspis")}>
                                Open Aspis
                            </Button>
                            <Button variant="secondary" onClick={() => onNavigate("settings")}>
                                Settings
                            </Button>
                        </>
                    }
                />
            }
        >
            <StatGrid
                stats={[
                    { label: "Version", value: health?.version ?? "..." },
                    { label: "Schema", value: health ? `v${health.schemaVersion}` : "..." },
                    { label: "Data version", value: server.dataVersion ?? "..." },
                    { label: "Theme", value: server.settings.theme },
                ]}
            />
            <Section label="Local state">
                <MetaTree
                    items={[
                        { term: "Database", values: [health?.dbPath ?? "Connecting"] },
                        { term: "Server", values: [health ? `pid ${health.pid}, started ${new Date(health.startedAt).toLocaleString()}` : "Connecting"] },
                        { term: "Sync", values: ["Polls PRAGMA data_version every 500 ms", "Pushes changes over the local WebSocket"] },
                    ]}
                />
            </Section>
            <Section label="Sprints" count={sprints.length}>
                <List label="Sprints">
                    {sprints.map((sprint) => (
                        <ListRow
                            key={sprint.id}
                            lead={sprint.id}
                            title={sprint.title}
                            meta={[sprint.detail]}
                            active={sprint.state === "Next"}
                            trail={<Chip tone={sprint.tone}>{sprint.state}</Chip>}
                            onSelect={["S2", "S3", "S4"].includes(sprint.id) ? () => onNavigate("kanban") : sprint.id === "S5" ? () => onNavigate("build") : undefined}
                        />
                    ))}
                </List>
            </Section>
        </Page>
    );
}
