import { type KeyboardEvent, type ReactNode, createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, Kbd, type Tone, VisuallyHidden } from "./primitives.tsx";

export interface Command {
    id: string;
    label: string;
    hint?: string;
    hotkey?: string;
    run: () => void;
}

/*
 * A combobox over the commands, in a native modal dialog so it stacks over any open panel and Escape closes only
 * the palette. The number of matches is announced as the query changes; focus returns to where it was.
 */
export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: readonly Command[] }) {
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState(0);
    const dialog = useRef<HTMLDialogElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const listId = useId();

    useEffect(() => {
        const element = dialog.current;
        if (!open || !element) return;
        const from = document.activeElement;
        setQuery("");
        setIndex(0);
        element.showModal();
        input.current?.focus();
        return () => {
            if (element.open) element.close();
            if (from instanceof HTMLElement && from.isConnected) from.focus();
        };
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
        }
    };

    return (
        <dialog
            ref={dialog}
            className="aspis-palette"
            aria-label="Commands"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <div className="aspis-palette__box">
                <div className="aspis-palette__prompt">
                    <Icon name="search" className="aspis-palette__icon" />
                    <input
                        ref={input}
                        className="aspis-palette__input"
                        role="combobox"
                        aria-label="Command"
                        aria-autocomplete="list"
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
                <ul className="aspis-palette__list" id={listId} role="listbox" aria-label="Commands">
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
                            {command.hotkey && <Kbd aria-hidden="true">{command.hotkey}</Kbd>}
                        </li>
                    ))}
                </ul>
                {matches.length === 0 && <p className="aspis-palette__none">No command matches</p>}
                <VisuallyHidden role="status">{needle ? `${matches.length} commands` : ""}</VisuallyHidden>
            </div>
        </dialog>
    );
}

interface ToastInput {
    text: string;
    tone?: Tone;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

let toastSeq = 0;
const toastLife = 3200;

/*
 * Toasts leave after a few seconds unless the pointer or focus rests on them. Errors go to an assertive region,
 * everything else to a polite one. While a modal dialog is open the rest of the page is inert, so the toasts are
 * rendered inside the dialog on top to stay visible and announced.
 */
export function Toaster({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<(ToastInput & { id: number; left: number })[]>([]);
    const [held, setHeld] = useState(false);
    const push = useCallback((toast: ToastInput) => setToasts((current) => [...current, { ...toast, id: ++toastSeq, left: toastLife }]), []);

    useEffect(() => {
        if (held || toasts.length === 0) return;
        const tick = 200;
        const timer = setInterval(() => setToasts((current) => current.map((toast) => ({ ...toast, left: toast.left - tick })).filter((toast) => toast.left > 0)), tick);
        return () => clearInterval(timer);
    }, [held, toasts.length]);

    const region = (danger: boolean) => (
        <div role={danger ? "alert" : "status"} className="aspis-toaster__region">
            {toasts
                .filter((toast) => (toast.tone === "danger") === danger)
                .map((toast) => (
                    <div key={toast.id} className="aspis-toast" data-tone={toast.tone ?? "ok"}>
                        <i className="aspis-toast__dot" aria-hidden="true" />
                        <span className="aspis-toast__text">{toast.text}</span>
                    </div>
                ))}
        </div>
    );

    return (
        <ToastContext value={push}>
            {children}
            {createPortal(
                <div className="aspis-toaster" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
                    {region(false)}
                    {region(true)}
                </div>,
                [...document.querySelectorAll("dialog[open]")].at(-1) ?? document.body,
            )}
        </ToastContext>
    );
}

export const useToast = () => useContext(ToastContext);
