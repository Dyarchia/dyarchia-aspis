import { type KeyboardEvent, type ReactNode, createContext, useCallback, useContext, useEffect, useId, useState } from "react";
import { Icon, Kbd, type Tone } from "./primitives.tsx";

export interface Command {
    id: string;
    label: string;
    hint?: string;
    hotkey?: string;
    run: () => void;
}

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: readonly Command[] }) {
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState(0);
    const listId = useId();

    useEffect(() => {
        if (open) {
            setQuery("");
            setIndex(0);
        }
    }, [open]);

    if (!open) return null;

    const needle = query.trim().toLowerCase();
    const matches = commands.filter((command) => `${command.label} ${command.hint ?? ""}`.toLowerCase().includes(needle));
    const active = Math.min(index, Math.max(matches.length - 1, 0));
    const run = (command: Command | undefined) => {
        if (!command) return;
        onClose();
        command.run();
    };
    const navigate = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setIndex((active + step + matches.length) % Math.max(matches.length, 1));
        } else if (event.key === "Enter") {
            event.preventDefault();
            run(matches[active]);
        } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
        }
    };

    return (
        <div className="aspis-palette" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <div className="aspis-palette__box" role="dialog" aria-modal="true" aria-label="Command palette">
                <div className="aspis-palette__prompt">
                    <span className="aspis-palette__sigil" aria-hidden="true">
                        aspis &gt;
                    </span>
                    <Icon name="search" className="aspis-palette__icon" />
                    <input
                        autoFocus
                        className="aspis-palette__input"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={listId}
                        aria-activedescendant={matches[active] ? `${listId}-${matches[active].id}` : undefined}
                        placeholder="Type a command"
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setIndex(0);
                        }}
                        onKeyDown={navigate}
                    />
                </div>
                <ul className="aspis-palette__list" id={listId} role="listbox">
                    {matches.map((command, at) => (
                        <li
                            key={command.id}
                            id={`${listId}-${command.id}`}
                            role="option"
                            aria-selected={at === active}
                            className="aspis-palette__option"
                            onMouseEnter={() => setIndex(at)}
                            onClick={() => run(command)}
                        >
                            <span className="aspis-palette__label">{command.label}</span>
                            <span className="aspis-palette__hint">{command.hint}</span>
                            {command.hotkey && <Kbd>{command.hotkey}</Kbd>}
                        </li>
                    ))}
                    {matches.length === 0 && <li className="aspis-palette__none">No command matches</li>}
                </ul>
                <footer className="aspis-palette__foot">
                    <span>
                        <Kbd>↑↓</Kbd> move
                    </span>
                    <span>
                        <Kbd>Enter</Kbd> run
                    </span>
                    <span>
                        <Kbd>Esc</Kbd> close
                    </span>
                </footer>
            </div>
        </div>
    );
}

interface ToastInput {
    text: string;
    tone?: Tone;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

let toastSeq = 0;

export function Toaster({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<(ToastInput & { id: number })[]>([]);
    const push = useCallback((toast: ToastInput) => {
        const id = ++toastSeq;
        setToasts((current) => [...current, { ...toast, id }]);
        setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 3200);
    }, []);
    return (
        <ToastContext value={push}>
            {children}
            <div className="aspis-toaster" role="status" aria-live="polite">
                {toasts.map((toast) => (
                    <div key={toast.id} className="aspis-toast" data-tone={toast.tone ?? "ok"}>
                        <i className="aspis-toast__dot" aria-hidden="true" />
                        <span className="aspis-toast__text">{toast.text}</span>
                    </div>
                ))}
            </div>
        </ToastContext>
    );
}

export const useToast = () => useContext(ToastContext);

export function KbdHint({ children }: { children: ReactNode }) {
    return <div className="aspis-hint">{children}</div>;
}
