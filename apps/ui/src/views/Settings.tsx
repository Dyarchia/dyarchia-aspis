import { Button, Chip, Dialog, GroupHeader, Switch } from "@dyarchia/aspis";
import type { Theme } from "@dyarchia/core";
import { useAgents } from "../use-agents.ts";
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
    tutorial,
    onTutorial,
}: {
    open: boolean;
    onClose: () => void;
    server: ServerState;
    updates: Updates;
    onTheme: (theme: Theme) => void;
    singleKeys: boolean;
    onSingleKeys: (enabled: boolean) => void;
    tutorial: boolean;
    onTutorial: (enabled: boolean) => void;
}) {
    return (
        <Dialog open={open} onClose={onClose} title="Settings" placement="center">
            {open && <SettingsBody server={server} updates={updates} onTheme={onTheme} singleKeys={singleKeys} onSingleKeys={onSingleKeys} tutorial={tutorial} onTutorial={onTutorial} />}
        </Dialog>
    );
}

function SettingsBody({
    server,
    updates,
    onTheme,
    singleKeys,
    onSingleKeys,
    tutorial,
    onTutorial,
}: {
    server: ServerState;
    updates: Updates;
    onTheme: (theme: Theme) => void;
    singleKeys: boolean;
    onSingleKeys: (enabled: boolean) => void;
    tutorial: boolean;
    onTutorial: (enabled: boolean) => void;
}) {
    const agents = useAgents(server);
    const status = updateStatus(updates.state);

    return (
        <>
            <Switch off="Dark" label="Light" checked={server.settings.theme === "light"} onChange={(light) => onTheme(light ? "light" : "dark")} />

            <div className="flex items-center gap-[var(--space-3)]">
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

            <section className="flex flex-col gap-[var(--space-3)]">
                <GroupHeader label="Agent CLIs" />
                <ul className="m-0 flex list-none flex-col gap-[var(--space-3)] p-0">
                    {agents.agents?.map((agent) => (
                        <li key={agent.harness} className="flex items-center gap-[var(--space-3)]">
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

            <Switch
                checked={singleKeys}
                onChange={onSingleKeys}
                label="Single-key shortcuts"
                hint="H K B open views, S Settings, T theme, N new. Ctrl K opens commands and Ctrl B hides the sidebar either way."
            />

            <Switch checked={tutorial} onChange={onTutorial} label="Build tutorial" hint="Each new piece opens on a guided walk through what it is and how to fill it." />

            <div className="flex min-w-0 flex-col gap-[var(--space-1)]">
                <span className="aspis-field__hint truncate" title={server.health?.dbPath}>
                    {server.health?.dbPath ?? "…"}
                </span>
                {server.health?.lastDispatch && <span className="aspis-field__hint">Last dispatch {new Date(server.health.lastDispatch).toLocaleString()}</span>}
            </div>
        </>
    );
}
