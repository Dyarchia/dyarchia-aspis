import { AppShell, type Command, CommandPalette, type NavEntry, Status, Toaster, setSingleKeyHotkeys, useHotkeys, useToast } from "@dyarchia/aspis";
import type { Theme } from "@dyarchia/core";
import { type KindId, kindIds, kinds } from "@dyarchia/library";
import { useEffect, useMemo, useRef, useState } from "react";
import { RepoMenu } from "./RepoMenu.tsx";
import { readHint, writeHint } from "./hints.ts";
import { useLibrary } from "./use-library.ts";
import { useProjects } from "./use-projects.ts";
import { type ServerState, useServer } from "./use-server.ts";
import { useUpdates } from "./use-updates.ts";
import { Home } from "./views/Home.tsx";
import { Build } from "./views/build/Build.tsx";
import { type Selection, piecesOf, unpublished } from "./views/build/pieces.ts";
import { Kanban } from "./views/kanban/Kanban.tsx";
import { Projects, type Session } from "./views/projects/Projects.tsx";
import { Settings } from "./views/Settings.tsx";

const views = [
    { id: "home", label: "Home", icon: "home", hotkey: "H" },
    { id: "kanban", label: "Kanban", icon: "board", hotkey: "K" },
    { id: "build", label: "Build", icon: "layers", hotkey: "B" },
    { id: "projects", label: "Projects", icon: "projects", hotkey: "P" },
] as const satisfies readonly NavEntry<string>[];

type View = (typeof views)[number]["id"];

const isView = (value: string | undefined): value is View => views.some((entry) => entry.id === value);

export function App() {
    return (
        <Toaster>
            <Workspace />
        </Toaster>
    );
}

/*
 * Moving to another view titles the window after it and, when the move came from the user, puts focus on the new
 * view's heading so the keyboard and the screen reader start from the top of what changed. Settings is a dialog
 * over whatever view is open, reached from the gear under the views, S or the palette. The palette offers only what
 * would change something: never the view already open or the theme already in use.
 */
function Workspace() {
    const server = useServer();
    const toast = useToast();
    const stored = readHint("view");
    const [view, setView] = useState<View>(isView(stored) ? stored : "home");
    const [palette, setPalette] = useState(false);
    const [settings, setSettings] = useState(false);
    const [singleKeys, setSingleKeys] = useState(readHint("keys.single") !== "off");
    const [tutorial, setTutorial] = useState(readHint("build.tutorial") !== "off");
    const library = useLibrary(server);
    const [selection, setSelection] = useState<Selection>();
    const [menuOpened, setMenuOpened] = useState(0);
    const [creating, setCreating] = useState<KindId>();
    const [tree, setTree] = useState(readHint("build.tree") !== "closed");
    const [folders, setFolders] = useState(() => new Set((readHint("build.folders") ?? "skills").split(",").filter((id): id is KindId => kindIds.includes(id as KindId))));
    const projects = useProjects(server);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [session, setSession] = useState<string>();
    const [projectTree, setProjectTree] = useState(readHint("projects.tree") !== "closed");
    const [projectFolders, setProjectFolders] = useState(() => new Set((readHint("projects.folders") ?? "").split(",").filter(Boolean)));
    const moved = useRef(false);
    const updates = useUpdates((info) => toast({ text: `Version ${info.version} is available. Install it from Settings`, tone: "info" }));

    useEffect(() => setSingleKeyHotkeys(singleKeys), [singleKeys]);

    useEffect(() => {
        document.title = `${views.find((entry) => entry.id === view)!.label} · Dyarchia Aspis`;
        if (!moved.current) return;
        moved.current = false;
        document.querySelector<HTMLElement>(".aspis-shell__main h1")?.focus();
    }, [view]);

    const go = (next: View) => {
        moved.current = next !== view;
        setView(next);
        writeHint("view", next);
    };
    const chooseTheme = (theme: Theme) => void server.saveSettings({ theme });
    const chooseKeys = (enabled: boolean) => {
        setSingleKeys(enabled);
        writeHint("keys.single", enabled ? "on" : "off");
    };
    const chooseTutorial = (enabled: boolean) => {
        setTutorial(enabled);
        writeHint("build.tutorial", enabled ? "on" : "off");
    };
    const openTree = (open: boolean) => {
        setTree(open);
        writeHint("build.tree", open ? "open" : "closed");
    };
    const toggleFolder = (kind: KindId, open = !folders.has(kind)) => {
        const next = new Set(folders);
        if (open) next.add(kind);
        else next.delete(kind);
        setFolders(next);
        writeHint("build.folders", [...next].join(","));
    };
    const select = (next?: Selection) => {
        if (next) toggleFolder(next.kind, true);
        setSelection(next);
        go("build");
    };
    const openProjectTree = (open: boolean) => {
        setProjectTree(open);
        writeHint("projects.tree", open ? "open" : "closed");
    };
    const toggleProject = (id: string, open = !projectFolders.has(id)) => {
        const next = new Set(projectFolders);
        if (open) next.add(id);
        else next.delete(id);
        setProjectFolders(next);
        writeHint("projects.folders", [...next].join(","));
    };
    /* Sessions are numbered per project and never reuse a number while the app is open. */
    const openSession = (board: number) => {
        const taken = sessions.filter((entry) => entry.board === board).map((entry) => Number(entry.label.split(" ")[1]));
        const label = `Session ${Math.max(0, ...taken) + 1}`;
        const id = `${board}-${Date.now()}`;
        setSessions([...sessions, { id, board, label }]);
        setSession(id);
        toggleProject(String(board), true);
        go("projects");
    };
    const closeSession = (id: string) => {
        setSessions(sessions.filter((entry) => entry.id !== id));
        if (session === id) setSession(undefined);
    };
    const pieces = useMemo(() => piecesOf(library.files), [library.files]);
    const marked = unpublished(library);
    /*
     * Build opens in the sidebar into one folder per kind and one file per piece, the open folders remembered; a
     * file not published yet carries a dot.
     */
    const projectEntry = (entry: NavEntry<View>): NavEntry<View> => ({
        ...entry,
        open: projectTree,
        onToggle: () => openProjectTree(!projectTree),
        folders: projects.map((project) => {
            const id = String(project.id);
            const mine = sessions.filter((entry) => entry.board === project.id);
            return {
                id,
                label: project.name,
                count: mine.length,
                open: projectFolders.has(id),
                onToggle: () => toggleProject(id),
                add: { label: `New session in ${project.name}`, onAdd: () => openSession(project.id) },
                items: mine.map((entry) => ({
                    id: entry.id,
                    label: entry.label,
                    current: view === "projects" && session === entry.id,
                    onSelect: () => (setSession(entry.id), go("projects")),
                })),
            };
        }),
    });
    const entries: NavEntry<View>[] = views.map((entry) =>
        entry.id === "projects" ? projectEntry(entry) : entry.id === "build" && library.status
            ? {
                  ...entry,
                  open: tree,
                  onToggle: () => openTree(!tree),
                  folders: kindIds.map((kind) => ({
                      id: kind,
                      label: kinds[kind].label,
                      count: pieces.get(kind)?.length ?? 0,
                      open: folders.has(kind),
                      onToggle: () => toggleFolder(kind),
                      add: { label: `New ${kinds[kind].singular}`, onAdd: () => (go("build"), setCreating(kind)) },
                      items: (pieces.get(kind) ?? []).map((name) => ({
                          id: name,
                          label: name,
                          current: view === "build" && selection?.kind === kind && selection.name === name,
                          mark: marked.has(`${kind}/${name}`) ? "Not published" : undefined,
                          onSelect: () => select({ kind, name }),
                      })),
                  })),
              }
            : entry,
    );
    const otherTheme: Theme = server.settings.theme === "dark" ? "light" : "dark";

    const commands: Command[] = [
        ...views.filter((entry) => entry.id !== view).map((entry) => ({ id: `go-${entry.id}`, label: `Go to ${entry.label}`, hotkey: entry.hotkey, run: () => go(entry.id) })),
        { id: "settings", label: "Open Settings", hotkey: "S", run: () => setSettings(true) },
        { id: "theme", label: `Use the ${otherTheme} theme`, hotkey: "T", run: () => chooseTheme(otherTheme) },
        ...(updates.state.kind === "unsupported" ? [] : [{ id: "update-check", label: "Check for updates", run: () => void updates.check() }]),
        ...(updates.state.kind === "available"
            ? [{ id: "update-install", label: `Install ${updates.state.info.version}`, hint: "Restarts the app", run: () => void updates.install() }]
            : []),
    ];

    useHotkeys({
        ...Object.fromEntries(views.map((entry) => [entry.hotkey.toLowerCase(), () => go(entry.id)])),
        s: () => setSettings(true),
        t: () => chooseTheme(otherTheme),
        "/": () => setPalette(true),
        "mod+k": () => setPalette((open) => !open),
    });

    return (
        <>
            <AppShell
                nav={entries}
                active={view}
                onNavigate={(next) => (next === "build" ? select(undefined) : go(next))}
                brand={{
                    name: "Dyarchia Aspis",
                    detail: library.repo ?? "No repository",
                    label: "Library repository",
                    menu: <RepoMenu library={library} opened={menuOpened} />,
                    onOpen: () => setMenuOpened((count) => count + 1),
                }}
                state={server.error ? "error" : server.live ? "live" : "connecting"}
                status={<ServerStatus server={server} />}
                links={[{ label: "Settings", icon: "settings", hotkey: "S", onClick: () => setSettings(true) }]}
            >
                {view === "home" && <Home />}
                {view === "kanban" && <Kanban server={server} />}
                {view === "projects" && (
                    <Projects projects={projects} sessions={sessions} current={session} onClose={closeSession} onRoot={() => setSession(undefined)} />
                )}
                {view === "build" && (
                    <Build library={library} selection={selection} onSelect={select} creating={creating} onCreated={() => setCreating(undefined)} tutorial={tutorial} />
                )}
            </AppShell>
            <Settings open={settings} onClose={() => setSettings(false)} server={server} updates={updates} onTheme={chooseTheme} singleKeys={singleKeys} onSingleKeys={chooseKeys} tutorial={tutorial} onTutorial={chooseTutorial} />
            <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} />
        </>
    );
}

function ServerStatus({ server }: { server: ServerState }) {
    if (server.error) return <Status tone="danger">Server error</Status>;
    if (!server.live) return <Status tone="warn">Connecting</Status>;
    return null;
}
