import { type ReactNode, useEffect, useRef } from "react";
import { Icon, type IconName } from "./primitives.tsx";

export interface NavEntry<T extends string> {
    id: T;
    label: string;
    icon: IconName;
    hotkey: string;
}

/*
 * The window already carries the app's name, so the sidebar holds only the views, the server state when it is not
 * healthy, and the controls pinned under them (Settings). Shortcuts stay announced through aria-keyshortcuts and
 * listed in the command palette instead of printed on every link.
 */
export function AppShell<T extends string>({
    nav,
    active,
    onNavigate,
    status,
    tools,
    state,
    children,
}: {
    nav: readonly NavEntry<T>[];
    active: T;
    onNavigate: (id: T) => void;
    status: ReactNode;
    tools?: ReactNode;
    state?: string;
    children: ReactNode;
}) {
    return (
        <div className="aspis-shell" data-state={state}>
            <a className="aspis-shell__skip" href="#aspis-main">
                Skip to content
            </a>
            <nav className="aspis-shell__nav" aria-label="Primary">
                <ul>
                    {nav.map((entry) => (
                        <li key={entry.id}>
                            <button
                                type="button"
                                className="aspis-shell__link"
                                aria-current={entry.id === active ? "page" : undefined}
                                aria-keyshortcuts={entry.hotkey}
                                onClick={() => onNavigate(entry.id)}
                            >
                                <Icon name={entry.icon} />
                                <span className="aspis-shell__label">{entry.label}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>
            <div className="aspis-shell__foot">
                <div className="aspis-shell__status" role="status">
                    {status}
                </div>
                {tools}
            </div>
            <main id="aspis-main" className="aspis-shell__main" tabIndex={-1}>
                {children}
            </main>
        </div>
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
            if (!mod && (!singleKeys || typing(event.target) || document.querySelector("dialog[open]"))) return;
            event.preventDefault();
            action();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
}
