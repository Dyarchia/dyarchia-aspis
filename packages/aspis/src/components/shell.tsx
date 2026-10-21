import { type ReactNode, createContext, useContext, useEffect, useRef, useState } from "react";
import { Icon, IconButton, type IconName } from "./primitives.tsx";

export interface NavItem {
    id: string;
    label: string;
    current?: boolean;
    mark?: string;
    onSelect: () => void;
}

export interface NavFolder {
    id: string;
    label: string;
    count: number;
    open: boolean;
    onToggle: () => void;
    add?: { label: string; onAdd: () => void };
    items: readonly NavItem[];
}

export interface NavEntry<T extends string> {
    id: T;
    label: string;
    icon: IconName;
    hotkey: string;
    folders?: readonly NavFolder[];
    open?: boolean;
    onToggle?: () => void;
}

export interface ShellLink {
    label: string;
    icon: IconName;
    hotkey?: string;
    onClick: () => void;
}

const Sidebar = createContext<{ collapsed: boolean; toggle: () => void }>({ collapsed: false, toggle: () => undefined });

export const useSidebar = () => useContext(Sidebar);

/*
 * The shell, laid out as shadcn's collapsible sidebar: the app and what it works on at the top, the views under it,
 * and a view that holds things (Build) opens into its folders and their files, each level one indent and one guide
 * line deeper. The server state and the pinned links (Settings) sit at the foot. Ctrl B or the button at the start
 * of every page bar hides the sidebar altogether; under 1100px it narrows to icons and the tree closes.
 */
export function AppShell<T extends string>({
    nav,
    active,
    onNavigate,
    brand,
    status,
    links,
    state,
    children,
}: {
    nav: readonly NavEntry<T>[];
    active: T;
    onNavigate: (id: T) => void;
    brand: { name: string; detail: string };
    status: ReactNode;
    links: readonly ShellLink[];
    state?: string;
    children: ReactNode;
}) {
    const [collapsed, setCollapsed] = useState(false);
    const toggle = () => setCollapsed((value) => !value);
    useHotkeys({ "mod+b": toggle });
    const link = (props: { icon: IconName; label: string; current?: boolean; hotkey?: string; mark?: string; count?: number; onClick: () => void; expanded?: boolean }) => (
        <button
            type="button"
            className="aspis-shell__link"
            aria-current={props.current ? "page" : undefined}
            aria-expanded={props.expanded}
            aria-keyshortcuts={props.hotkey}
            onClick={props.onClick}
        >
            <Icon name={props.icon} />
            <span className="aspis-shell__label">{props.label}</span>
            {props.count !== undefined && <span className="aspis-shell__count">{props.count}</span>}
            {props.mark && <span className="aspis-shell__mark" title={props.mark} aria-label={props.mark} />}
            {props.expanded !== undefined && <Icon name="next" className="aspis-shell__chevron" />}
        </button>
    );
    return (
        <Sidebar.Provider value={{ collapsed, toggle }}>
            <div className="aspis-shell" data-state={state} data-collapsed={collapsed || undefined}>
                <a className="aspis-shell__skip" href="#aspis-main">
                    Skip to content
                </a>
                <nav className="aspis-shell__nav" aria-label="Primary">
                    <div className="aspis-shell__brand">
                        <span className="aspis-shell__logo" aria-hidden="true">
                            {brand.name.slice(0, 1)}
                        </span>
                        <span className="aspis-shell__label">
                            <span className="aspis-shell__name">{brand.name}</span>
                            <span className="aspis-shell__detail">{brand.detail}</span>
                        </span>
                    </div>
                    <ul className="aspis-shell__menu">
                        {nav.map((entry) => (
                            <li key={entry.id}>
                                <div className="aspis-shell__row">
                                    {link({ icon: entry.icon, label: entry.label, current: entry.id === active, hotkey: entry.hotkey, onClick: () => onNavigate(entry.id) })}
                                    {entry.folders && (
                                        <IconButton
                                            icon="next"
                                            className="aspis-shell__toggle"
                                            label={`${entry.open ? "Close" : "Open"} ${entry.label}`}
                                            aria-expanded={entry.open}
                                            onClick={entry.onToggle}
                                        />
                                    )}
                                </div>
                                {entry.folders && entry.open && (
                                    <ul className="aspis-shell__sub">
                                        {entry.folders.map((folder) => (
                                            <li key={folder.id}>
                                                <div className="aspis-shell__row">
                                                    {link({ icon: folder.open ? "open" : "folder", label: folder.label, count: folder.count, expanded: folder.open, onClick: folder.onToggle })}
                                                    {folder.add && <IconButton icon="plus" className="aspis-shell__add" label={folder.add.label} onClick={folder.add.onAdd} />}
                                                </div>
                                                {folder.open && folder.items.length > 0 && (
                                                    <ul className="aspis-shell__sub">
                                                        {folder.items.map((item) => (
                                                            <li key={item.id}>{link({ icon: "file", label: item.label, current: item.current, mark: item.mark, onClick: item.onSelect })}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ul>
                </nav>
                <div className="aspis-shell__foot">
                    <div className="aspis-shell__status" role="status">
                        {status}
                    </div>
                    <ul className="aspis-shell__menu">
                        {links.map((entry) => (
                            <li key={entry.label}>{link({ icon: entry.icon, label: entry.label, hotkey: entry.hotkey, onClick: entry.onClick })}</li>
                        ))}
                    </ul>
                </div>
                <main id="aspis-main" className="aspis-shell__main" tabIndex={-1}>
                    {children}
                </main>
            </div>
        </Sidebar.Provider>
    );
}

const typing = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

let singleKeys = true;

export const setSingleKeyHotkeys = (enabled: boolean) => {
    singleKeys = enabled;
};

/*
 * Single-letter shortcuts fire only when no modifier is held, focus is not in a text field and no modal dialog is
 * open, and the user can switch them off altogether (WCAG 2.1.4). Keys are matched case-insensitively; "mod+k"
 * chords use Ctrl (or Cmd) and work everywhere, including inside fields.
 */
export function useHotkeys(bindings: Record<string, () => void>) {
    const ref = useRef(bindings);
    ref.current = bindings;
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const mod = event.ctrlKey || event.metaKey;
            const key = `${mod ? "mod+" : ""}${event.key.toLowerCase()}`;
            const action = ref.current[key];
            if (!action || event.altKey) return;
            const local = event.target instanceof Element && event.target.closest("[data-keys='local']");
            if (!mod && (!singleKeys || typing(event.target) || local || document.querySelector("dialog[open]"))) return;
            event.preventDefault();
            action();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
}
