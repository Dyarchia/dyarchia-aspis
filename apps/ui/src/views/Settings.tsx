import { Button, Chip, MetaTree, Page, PageHeader, Panel, Section, themeCatalog } from "@dyarchia/aspis";
import type { Theme } from "@dyarchia/core";
import type { ServerState } from "../use-server.ts";

export function SettingsView({ server, onTheme }: { server: ServerState; onTheme: (theme: Theme) => void }) {
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
            <Section label="About">
                <MetaTree
                    items={[
                        { term: "Version", values: [server.health?.version ?? "..."] },
                        { term: "State", values: [server.health?.dbPath ?? "..."] },
                        { term: "Shortcuts", values: ["H K B A S navigate", "T switches theme", "Ctrl K or / opens commands"] },
                    ]}
                />
            </Section>
        </Page>
    );
}
