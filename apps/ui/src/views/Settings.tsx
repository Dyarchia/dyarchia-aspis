import { Button, Chip, MetaTree, Page, PageHeader, Panel, Section, themeCatalog } from "@dyarchia/aspis";
import type { Theme } from "@dyarchia/core";
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
