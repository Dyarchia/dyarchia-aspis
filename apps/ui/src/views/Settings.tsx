import { Button, Chip, MetaTree, Page, PageHeader, Panel, Section, TextField, themeCatalog } from "@dyarchia/aspis";
import type { Theme } from "@dyarchia/core";
import { useState } from "react";
import { useAgents } from "../use-agents.ts";
import { useLibrary } from "../use-library.ts";
import type { ServerState } from "../use-server.ts";
import type { UpdateState, Updates } from "../use-updates.ts";

const updateStatus = (state: UpdateState) => {
    switch (state.kind) {
        case "unsupported":
            return "Updates run in the desktop app";
        case "idle":
            return "Not checked yet";
        case "checking":
            return "Checking GitHub releases";
        case "current":
            return "Up to date";
        case "available":
            return `Version ${state.info.version} is ready to install`;
        case "installing":
            return `Installing ${state.info.version}; the app closes and comes back on its own`;
        case "error":
            return state.message;
    }
};

export function SettingsView({ server, updates, onTheme }: { server: ServerState; updates: Updates; onTheme: (theme: Theme) => void }) {
    const current = server.settings.theme;
    const agents = useAgents(server);
    const library = useLibrary(server);
    const [repo, setRepo] = useState("");
    return (
        <Page head={<PageHeader title="Settings" explanation="Shared by every client." lead="The theme is stored in state.db, so every open client follows the change." />}>
            <Section label="Theme" count={Object.keys(themeCatalog).length}>
                <div className="grid grid-cols-2 gap-[var(--aspis-space-5)]">
                    {(Object.keys(themeCatalog) as Theme[]).map((theme) => (
                        <Panel
                            key={theme}
                            title={themeCatalog[theme].label}
                            actions={theme === current ? <Chip tone="ok">Active</Chip> : undefined}
                        >
                            <div className="flex flex-col items-start gap-[var(--aspis-space-4)]">
                                <p className="m-0">{themeCatalog[theme].description}</p>
                                <Button variant={theme === current ? "secondary" : "primary"} disabled={theme === current} onClick={() => onTheme(theme)}>
                                    {theme === current ? "In use" : `Use ${themeCatalog[theme].label}`}
                                </Button>
                            </div>
                        </Panel>
                    ))}
                </div>
            </Section>
            <Section
                label="Updates"
                actions={
                    updates.state.kind === "available" ? (
                        <Button variant="primary" icon="arrow" onClick={() => void updates.install()}>
                            Install {updates.state.info.version}
                        </Button>
                    ) : (
                        <Button
                            variant="secondary"
                            icon="history"
                            disabled={["unsupported", "checking", "installing"].includes(updates.state.kind)}
                            onClick={() => void updates.check()}
                        >
                            Check for updates
                        </Button>
                    )
                }
            >
                <MetaTree
                    items={[
                        { term: "Installed", values: [server.health?.version ?? "..."] },
                        { term: "Status", values: [updateStatus(updates.state)] },
                        { term: "Channel", values: ["Alpha prereleases from github.com/Dyarchia/dyarchia-aspis, signed and verified"] },
                    ]}
                />
            </Section>
            <Section label="Scheduled runs">
                <MetaTree
                    items={[
                        { term: "Dispatcher", values: ["Each Scheduled card has its own Task Scheduler entry at its time; nothing polls, and it runs with the app closed"] },
                        { term: "Last dispatch", values: [server.health?.lastDispatch ? new Date(server.health.lastDispatch).toLocaleString() : "Not yet"] },
                        { term: "Runs", values: ["claude -p on a feature/develop/card-<id> branch, committed there, never pushed"] },
                    ]}
                />
            </Section>
            <Section label="Agent CLIs" count={agents.agents?.length}>
                <div className="flex flex-col gap-[var(--aspis-space-4)]">
                    <p className="aspis-field__hint m-0">
                        Wiring a CLI writes three things to its user settings: hooks that hand a session its card and your messages, the dya-pickup skill you type
                        to pick a card up, and the aspis MCP server the agent uses to note, block and deliver. Remove takes exactly those back out.
                    </p>
                    {agents.agents?.map((agent) => (
                        <div key={agent.harness} className="flex flex-wrap items-center gap-[var(--aspis-space-4)]">
                            <span className="min-w-[120px]">{agent.harness}</span>
                            <Chip tone={agent.installed ? "ok" : agent.cli ? "idle" : "warn"}>{agent.installed ? "Wired" : agent.cli ? "Not wired" : "CLI not found"}</Chip>
                            <Button
                                variant={agent.installed ? "secondary" : "primary"}
                                disabled={!agents.installable || agents.busy !== undefined || (!agent.cli && !agent.installed)}
                                onClick={() => void (agent.installed ? agents.remove(agent.harness) : agents.install(agent.harness))}
                            >
                                {agent.installed ? "Remove" : "Wire it"}
                            </Button>
                        </div>
                    ))}
                    {agents.installable === false && <span className="aspis-field__hint">CLIs are wired from the installed desktop app.</span>}
                </div>
            </Section>
            <Section label="Library">
                <div className="flex flex-col gap-[var(--aspis-space-4)]">
                    <p className="aspis-field__hint m-0">
                        The GitHub repository where Build keeps your pieces. If it does not exist yet, Build creates it as a private repository with a develop
                        branch. Every change reaches it as a pull request to develop that you merge.
                    </p>
                    {library.repo && library.status ? (
                        <MetaTree
                            items={[
                                { term: "Repository", values: [library.repo] },
                                { term: "Folder", values: [library.status.path] },
                                { term: "Branch", values: [library.status.pr ? `${library.status.branch} · pull request ${library.status.pr.state.toLowerCase()}` : library.status.branch] },
                            ]}
                        />
                    ) : (
                        <div className="flex flex-wrap items-end gap-[var(--aspis-space-4)]">
                            <div className="min-w-[260px] flex-1">
                                <TextField label="Repository" placeholder="owner/mantinea" value={repo} onChange={(event) => setRepo(event.target.value)} />
                            </div>
                            <Button variant="primary" icon="layers" disabled={!repo.trim() || library.busy} onClick={() => void library.connect(repo.trim())}>
                                Connect
                            </Button>
                        </div>
                    )}
                </div>
            </Section>
            <Section label="About">
                <MetaTree
                    items={[
                        { term: "State", values: [server.health?.dbPath ?? "..."] },
                        { term: "Shortcuts", values: ["H K B A S navigate", "T switches theme", "Ctrl K or / opens commands"] },
                    ]}
                />
            </Section>
        </Page>
    );
}
