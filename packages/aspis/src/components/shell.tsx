import { type ReactNode, useEffect, useRef } from "react";
import { Icon, type IconName, Kbd } from "./primitives.tsx";

export interface NavEntry<T extends string> {
    id: T;
    label: string;
    icon: IconName;
    hotkey: string;
    badge?: string;
}

export function AppShell<T extends string>({
    brand,
    nav,
    active,
    onNavigate,
    status,
    children,
}: {
    brand: string;
    nav: readonly NavEntry<T>[];
    active: T;
    onNavigate: (id: T) => void;
    status: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="aspis-shell">
            <div className="aspis-shell__brand">
                <span className="aspis-shell__mark" aria-hidden="true" />
                {brand}
            </div>
            <nav className="aspis-shell__nav" aria-label="Primary">
                <ul>
                    {nav.map((entry) => (
                        <li key={entry.id}>
                            <button
                                type="button"
                                className="aspis-shell__link"
                                aria-current={entry.id === active ? "page" : undefined}
                                onClick={() => onNavigate(entry.id)}
                            >
                                <Icon name={entry.icon} />
                                <Kbd>{entry.hotkey}</Kbd>
                                <span className="aspis-shell__label">{entry.label}</span>
                                {entry.badge && <span className="aspis-shell__badge">{entry.badge}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>
            <div className="aspis-shell__status">{status}</div>
            <main className="aspis-shell__main">{children}</main>
        </div>
    );
}

const typing = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/*
 * Single-letter shortcuts fire only when no modifier is held and focus is not in a text field. Keys are matched
 * case-insensitively; "mod+k" style chords use Ctrl (or Cmd) and work everywhere, including inside fields.
 */
export function useHotkeys(bindings: Record<string, () => void>) {
    const ref = useRef(bindings);
    ref.current = bindings;
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const mod = event.ctrlKey || event.metaKey;
            const key = `${mod ? "mod+" : ""}${event.key.toLowerCase()}`;
            const action = ref.current[key];
            if (!action || event.altKey || (!mod && typing(event.target))) return;
            event.preventDefault();
            action();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
}
