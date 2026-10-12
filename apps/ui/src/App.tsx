import { AppShell, type Command, CommandPalette, Kbd, KbdHint, type NavEntry, Status, Toaster, themeCatalog, useHotkeys, useToast } from "@dyarchia/aspis";
import type { Theme } from "@dyarchia/core";
import { useState } from "react";
import { readHint, writeHint } from "./hints.ts";
import { type ServerState, useServer } from "./use-server.ts";
import { Gallery } from "./views/Gallery.tsx";
import { Home } from "./views/Home.tsx";
import { Pending } from "./views/Pending.tsx";
import { SettingsView } from "./views/Settings.tsx";

const nav = [
    { id: "home", label: "Home", icon: "home", hotkey: "H" },
    { id: "kanban", label: "Kanban", icon: "board", hotkey: "K", badge: "S2" },
    { id: "build", label: "Build", icon: "layers", hotkey: "B", badge: "S5" },
    { id: "aspis", label: "Aspis", icon: "shield", hotkey: "A" },
    { id: "settings", label: "Settings", icon: "settings", hotkey: "S" },
] as const satisfies readonly NavEntry<string>[];

type View = (typeof nav)[number]["id"];

const isView = (value: string | undefined): value is View => nav.some((entry) => entry.id === value);

export function App() {
    return (
        <Toaster>
            <Workspace />
        </Toaster>
    );
}

function Workspace() {
    const server = useServer();
    const toast = useToast();
    const stored = readHint("view");
    const [view, setView] = useState<View>(isView(stored) ? stored : "home");
    const [palette, setPalette] = useState(false);

    const go = (next: View) => {
        setView(next);
        writeHint("view", next);
    };
    const chooseTheme = async (theme: Theme) => {
        await server.setTheme(theme);
        toast({ text: `Theme set to ${themeCatalog[theme].label}`, tone: "info" });
    };
    const otherTheme: Theme = server.settings.theme === "io" ? "nyx" : "io";

    const commands: Command[] = [
        ...nav.map((entry) => ({ id: `go-${entry.id}`, label: `Go to ${entry.label}`, hint: "Navigate", hotkey: entry.hotkey, run: () => go(entry.id) })),
        ...(Object.keys(themeCatalog) as Theme[]).map((theme) => ({
            id: `theme-${theme}`,
            label: `Use the ${themeCatalog[theme].label} theme`,
            hint: themeCatalog[theme].description,
            run: () => void chooseTheme(theme),
        })),
    ];

    useHotkeys({
        ...Object.fromEntries(nav.map((entry) => [entry.hotkey.toLowerCase(), () => go(entry.id)])),
        t: () => void chooseTheme(otherTheme),
        "/": () => setPalette(true),
        "mod+k": () => setPalette((open) => !open),
    });

    return (
        <>
            <AppShell brand="Dyarchia Aspis" nav={nav} active={view} onNavigate={go} status={<ServerStatus server={server} />}>
                {view === "home" && <Home server={server} onNavigate={go} />}
                {view === "kanban" && (
                    <Pending
                        title="Kanban"
                        explanation="Eight fixed phases."
                        sprint="S2"
                        text="The board over state.db: Triage, Scheduled, Ready, Running, Review, Blocked, Done and Archived, with every client in sync in under a second."
                    />
                )}
                {view === "build" && (
                    <Pending
                        title="Build"
                        explanation="What the agents read."
                        sprint="S5"
                        text="Agents, skills, prompts, commands, rules, hooks, plugins and mods written to the mantinea library and published from there."
                    />
                )}
                {view === "aspis" && <Gallery theme={server.settings.theme} onTheme={chooseTheme} />}
                {view === "settings" && <SettingsView server={server} onTheme={chooseTheme} />}
            </AppShell>
            <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} />
            <KbdHint>
                <Kbd>Ctrl K</Kbd> commands · <Kbd>T</Kbd> theme
            </KbdHint>
        </>
    );
}

function ServerStatus({ server }: { server: ServerState }) {
    if (server.error) return <Status tone="danger">Server error</Status>;
    return <Status tone={server.live ? "ok" : "warn"}>{server.live ? "Server live" : "Connecting"}</Status>;
}
