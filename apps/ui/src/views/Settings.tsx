import { Button, Chip, GroupHeader, Menu, MetaTree, Page, Switch, Tabs, TextField, themeCatalog } from "@dyarchia/aspis";
import type { Theme } from "@dyarchia/core";
import { useState } from "react";
import { readHint, writeHint } from "../hints.ts";
import { useAgents } from "../use-agents.ts";
import { useLibrary } from "../use-library.ts";
import type { ServerState } from "../use-server.ts";
import type { UpdateState, Updates } from "../use-updates.ts";

const updateStatus = (state: UpdateState) => {
    switch (state.kind) {
        case "unsupported":
            return "Updates run in the desktop app";
        case "idle":
            return "Not checked";
        case "checking":
            return "Checking…";
        case "current":
            return "Up to date";
        case "available":
            return `${state.info.version} available`;
        case "installing":
            return `Installing ${state.info.version}, the app restarts`;
        case "error":
            return state.message;
    }
};

const sections = [
    { id: "theme", label: "Theme" },
    { id: "updates", label: "Updates" },
    { id: "scheduled", label: "Scheduled runs" },
    { id: "agents", label: "Agent CLIs" },
    { id: "library", label: "Library" },
    { id: "keyboard", label: "Keyboard" },
    { id: "about", label: "About" },
] as const;

type SectionId = (typeof sections)[number]["id"];

const isSection = (value: string | undefined): value is SectionId => sections.some((section) => section.id === value);

export function SettingsView({
    server,
    updates,
    onTheme,
    singleKeys,
    onSingleKeys,
}: {
    server: ServerState;
    updates: Updates;
    onTheme: (theme: Theme) => void;
    singleKeys: boolean;
    onSingleKeys: (enabled: boolean) => void;
}) {
    const agents = useAgents(server);
    const library = useLibrary(server);
    const [repo, setRepo] = useState("");
    const stored = readHint("settings.section");
    const [section, setSection] = useState<SectionId>(isSection(stored) ? stored : "theme");
    const choose = (next: SectionId) => {
        setSection(next);
        writeHint("settings.section", next);
    };
    const label = sections.find((entry) => entry.id === section)!.label;

    const updateAction =
        updates.state.kind === "available" ? (
            <Button variant="primary" icon="arrow" onClick={() => void updates.install()}>
                Install {updates.state.info.version}
            </Button>
        ) : (
            <Button variant="secondary" icon="history" disabled={["unsupported", "checking", "installing"].includes(updates.state.kind)} onClick={() => void updates.check()}>
                Check for updates
            </Button>
        );

    return (
        <Page title="Settings">
            <div className="grid min-h-0 flex-1 grid-cols-[var(--aspis-nav-w)_minmax(0,1fr)]">
                <div className="min-h-0 overflow-y-auto border-r border-[var(--aspis-line)] py-[var(--aspis-space-3)]">
                    <Menu label="Sections" value={section} items={sections} onSelect={choose} />
                </div>
                <section aria-label={label} className="min-h-0 overflow-y-auto p-[var(--aspis-space-5)]">
                    <div className="flex max-w-[720px] flex-col gap-[var(--aspis-space-5)]">
                        <GroupHeader label={label} actions={section === "updates" ? updateAction : undefined} />
                        {section === "theme" && (
                            <Tabs
                                label="Theme"
                                kind="radio"
                                value={server.settings.theme}
                                onChange={onTheme}
                                tabs={(Object.keys(themeCatalog) as Theme[]).map((id) => ({ id, label: themeCatalog[id].label }))}
                            />
                        )}
                        {section === "updates" && (
                            <MetaTree
                                items={[
                                    { term: "Installed", values: [server.health?.version ?? "…"] },
                                    { term: "Status", values: [updateStatus(updates.state)] },
                                ]}
                            />
                        )}
                        {section === "scheduled" && (
                            <MetaTree items={[{ term: "Last dispatch", values: [server.health?.lastDispatch ? new Date(server.health.lastDispatch).toLocaleString() : "Not yet"] }]} />
                        )}
                        {section === "agents" && (
                            <>
                                <p className="aspis-field__hint">Wiring adds the Aspis hooks, the dya-pickup skill and the aspis MCP server to the CLI. Remove takes them out.</p>
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
                                {agents.installable === false && <p className="aspis-field__hint">CLIs are wired from the installed desktop app.</p>}
                            </>
                        )}
                        {section === "library" &&
                            (library.repo && library.status ? (
                                <MetaTree
                                    items={[
                                        { term: "Repository", values: [library.repo] },
                                        { term: "Folder", values: [library.status.path] },
                                        { term: "Branch", values: [library.status.pr ? `${library.status.branch} · pull request ${library.status.pr.state.toLowerCase()}` : library.status.branch] },
                                    ]}
                                />
                            ) : (
                                <LibraryConnect repo={repo} onRepo={setRepo} busy={library.busy} onConnect={() => void library.connect(repo.trim())} />
                            ))}
                        {section === "keyboard" && (
                            <Switch checked={singleKeys} onChange={onSingleKeys} label="Single-key shortcuts" hint="H K B S open views, T switches theme, N adds a card. Ctrl K opens commands either way." />
                        )}
                        {section === "about" && <MetaTree items={[{ term: "State", values: [server.health?.dbPath ?? "…"] }]} />}
                    </div>
                </section>
            </div>
        </Page>
    );
}

export function LibraryConnect({ repo, onRepo, busy, onConnect }: { repo: string; onRepo: (repo: string) => void; busy: boolean; onConnect: () => void }) {
    return (
        <form
            className="flex flex-wrap items-start gap-[var(--aspis-space-4)]"
            onSubmit={(event) => {
                event.preventDefault();
                if (repo.trim()) onConnect();
            }}
        >
            <div className="min-w-[260px] flex-1">
                <TextField
                    label="Repository"
                    placeholder="owner/repo"
                    hint="Created as a private repository if it does not exist. Changes reach it as pull requests to develop."
                    value={repo}
                    onChange={(event) => onRepo(event.target.value)}
                />
            </div>
            <Button type="submit" variant="primary" icon="layers" className="mt-[24px]" disabled={!repo.trim() || busy}>
                Connect
            </Button>
        </form>
    );
}
