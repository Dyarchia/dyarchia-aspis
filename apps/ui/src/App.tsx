import { AppShell, type Command, CommandPalette, Kbd, KbdHint, type NavEntry, Status, Toaster, themeCatalog, useHotkeys, useToast } from "@dyarchia/aspis";
import type { Theme } from "@dyarchia/core";
import { useState } from "react";
import { readHint, writeHint } from "./hints.ts";
import { type ServerState, useServer } from "./use-server.ts";
import { useUpdates } from "./use-updates.ts";
import { Gallery } from "./views/Gallery.tsx";
import { Home } from "./views/Home.tsx";
import { Build } from "./views/build/Build.tsx";
import { Kanban } from "./views/kanban/Kanban.tsx";
import { SettingsView } from "./views/Settings.tsx";

const nav = [
    { id: "home", label: "Home", icon: "home", hotkey: "H" },
    { id: "kanban", label: "Kanban", icon: "board", hotkey: "K" },
    { id: "build", label: "Build", icon: "layers", hotkey: "B" },
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
    const updates = useUpdates((info) => toast({ text: `Version ${info.version} is available. Install it from Settings`, tone: "info" }));

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
        ...(updates.state.kind === "unsupported"
            ? []
            : [{ id: "update-check", label: "Check for updates", hint: "Looks for a newer release on GitHub", run: () => void updates.check() }]),
        ...(updates.state.kind === "available"
            ? [{ id: "update-install", label: `Install ${updates.state.info.version}`, hint: "Downloads, installs and restarts", run: () => void updates.install() }]
            : []),
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
                {view === "kanban" && <Kanban server={server} />}
                {view === "build" && <Build server={server} onSettings={() => go("settings")} />}
                {view === "aspis" && <Gallery theme={server.settings.theme} onTheme={chooseTheme} />}
                {view === "settings" && <SettingsView server={server} updates={updates} onTheme={chooseTheme} />}
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
