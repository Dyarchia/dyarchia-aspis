import { Button, Chip, Dialog, GroupHeader, Switch, TextField } from "@dyarchia/aspis";
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
            return undefined;
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

/*
 * Settings is a dialog over the open view: one column of short groups, each a label and the controls that change
 * it. Facts appear only where they matter (a version, a missing CLI, a pull request waiting) and the healthy state
 * says nothing.
 */
export function Settings({
    open,
    onClose,
    server,
    updates,
    onTheme,
    singleKeys,
    onSingleKeys,
}: {
    open: boolean;
    onClose: () => void;
    server: ServerState;
    updates: Updates;
    onTheme: (theme: Theme) => void;
    singleKeys: boolean;
    onSingleKeys: (enabled: boolean) => void;
}) {
    return (
        <Dialog open={open} onClose={onClose} title="Settings" placement="center">
            {open && <SettingsBody server={server} updates={updates} onTheme={onTheme} singleKeys={singleKeys} onSingleKeys={onSingleKeys} />}
        </Dialog>
    );
}

function SettingsBody({
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
    const status = updateStatus(updates.state);
    const pr = library.status?.pr;

    return (
        <>
            <Switch off="io" label="nyx" checked={server.settings.theme === "nyx"} onChange={(nyx) => onTheme(nyx ? "nyx" : "io")} />

            <div className="flex items-center gap-[var(--aspis-space-3)]">
                <span className="aspis-field__hint flex-1">{[server.health?.version ?? "…", status].filter(Boolean).join(" · ")}</span>
                {updates.state.kind === "available" ? (
                    <Button variant="primary" icon="arrow" onClick={() => void updates.install()}>
                        Install {updates.state.info.version}
                    </Button>
                ) : (
                    <Button variant="secondary" disabled={["unsupported", "checking", "installing"].includes(updates.state.kind)} onClick={() => void updates.check()}>
                        Check for updates
                    </Button>
                )}
            </div>

            <section className="flex flex-col gap-[var(--aspis-space-3)]">
                <GroupHeader label="Agent CLIs" />
                <ul className="m-0 flex list-none flex-col gap-[var(--aspis-space-3)] p-0">
                    {agents.agents?.map((agent) => (
                        <li key={agent.harness} className="flex items-center gap-[var(--aspis-space-3)]">
                            <span className="flex-1">{agent.harness}</span>
                            {!agent.cli && !agent.installed && <Chip tone="warn">CLI not found</Chip>}
                            <Button
                                variant={agent.installed ? "quiet" : "secondary"}
                                aria-label={`${agent.installed ? "Remove" : "Wire it"}, ${agent.harness}`}
                                disabled={!agents.installable || agents.busy !== undefined || (!agent.cli && !agent.installed)}
                                onClick={() => void (agent.installed ? agents.remove(agent.harness) : agents.install(agent.harness))}
                            >
                                {agent.installed ? "Remove" : "Wire it"}
                            </Button>
                        </li>
                    ))}
                </ul>
                {agents.installable === false && <span className="aspis-field__hint">CLIs are wired from the installed desktop app.</span>}
            </section>

            <section className="flex flex-col gap-[var(--aspis-space-3)]">
                <GroupHeader label="Library" />
                {library.repo && library.status ? (
                    <span className="aspis-field__hint">
                        {[library.repo, library.status.branch !== "develop" && library.status.branch, pr && `pull request ${pr.state.toLowerCase()}`].filter(Boolean).join(" · ")}
                    </span>
                ) : (
                    <LibraryConnect repo={repo} onRepo={setRepo} busy={library.busy} onConnect={() => void library.connect(repo.trim())} />
                )}
            </section>

            <Switch
                checked={singleKeys}
                onChange={onSingleKeys}
                label="Single-key shortcuts"
                hint="H K B open views, S Settings, T theme, N new. Ctrl K opens commands either way."
            />

            <div className="flex min-w-0 flex-col gap-[var(--aspis-space-1)]">
                <span className="aspis-field__hint truncate" title={server.health?.dbPath}>
                    {server.health?.dbPath ?? "…"}
                </span>
                {server.health?.lastDispatch && <span className="aspis-field__hint">Last dispatch {new Date(server.health.lastDispatch).toLocaleString()}</span>}
            </div>
        </>
    );
}

export function LibraryConnect({ repo, onRepo, busy, onConnect }: { repo: string; onRepo: (repo: string) => void; busy: boolean; onConnect: () => void }) {
    return (
        <form
            className="flex w-full max-w-[560px] items-start gap-[var(--aspis-space-3)]"
            onSubmit={(event) => {
                event.preventDefault();
                if (repo.trim()) onConnect();
            }}
        >
            <div className="flex-1">
                <TextField
                    label="Library repository"
                    hideLabel
                    placeholder="owner/repo"
                    hint="Created as a private repository if it does not exist."
                    value={repo}
                    onChange={(event) => onRepo(event.target.value)}
                />
            </div>
            <Button type="submit" variant="primary" disabled={!repo.trim() || busy}>
                Connect
            </Button>
        </form>
    );
}
