import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";
import { IconButton } from "./primitives.tsx";

/*
 * A view in a desktop window. The sidebar already says which view this is, so the title is only spoken (and takes
 * focus when the view changes); the optional toolbar and the panes start on the same top line as the sidebar. The
 * body never scrolls as a page; the panes inside it scroll on their own.
 */
export function Page({ title, tools, actions, children }: { title: string; tools?: ReactNode; actions?: ReactNode; children: ReactNode }) {
    return (
        <div className="aspis-page">
            <h1 className="aspis-sr" tabIndex={-1}>
                {title}
            </h1>
            {(tools || actions) && (
                <div className="aspis-page__bar">
                    {tools}
                    {actions && <div className="aspis-page__actions">{actions}</div>}
                </div>
            )}
            <div className="aspis-page__body">{children}</div>
        </div>
    );
}

export function GroupHeader({ label, actions }: { label: string; actions?: ReactNode }) {
    return (
        <header className="aspis-group">
            <h2 className="aspis-group__label">{label}</h2>
            {actions && <div className="aspis-group__actions">{actions}</div>}
        </header>
    );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
    return (
        <div className="aspis-empty">
            <p className="aspis-empty__title">{title}</p>
            {action && <div className="aspis-empty__action">{action}</div>}
        </div>
    );
}

/*
 * Holds a view's main pane and, beside it, an Inspector. The pane stays live while the inspector is open at half
 * width; at full width the inspector covers the pane and keeps the same margin on all four sides.
 */
export function Stage({ children }: { children: ReactNode }) {
    return <div className="aspis-stage">{children}</div>;
}

/*
 * A panel that inspects one thing without taking the window: not modal, so the pane beside it still works. Focus
 * starts on the panel when it opens and goes back to whatever opened it when it closes; Escape closes it, and the
 * single-key shortcuts pause while focus is inside, as they do in a dialog. Tools of the inspected thing (delete)
 * sit before the panel's own expand and close, on the title's line.
 */
export function Inspector({
    label,
    title,
    tools,
    full,
    onFull,
    onClose,
    children,
}: {
    label: string;
    title: ReactNode;
    tools?: ReactNode;
    full: boolean;
    onFull: (full: boolean) => void;
    onClose: () => void;
    children: ReactNode;
}) {
    const box = useRef<HTMLElement>(null);
    const opener = useRef<Element | null>(null);
    useEffect(() => {
        opener.current = document.activeElement;
        if (!box.current?.contains(document.activeElement)) box.current?.focus();
        return () => {
            const from = opener.current;
            if (from instanceof HTMLElement && from.isConnected) from.focus();
        };
    }, []);
    const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
    };
    return (
        <aside ref={box} className="aspis-inspector" data-size={full ? "full" : "half"} data-keys="local" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown}>
            <header className="aspis-inspector__head">
                <div className="aspis-inspector__title">{title}</div>
                <div className="aspis-inspector__tools">
                    {tools}
                    <IconButton icon={full ? "collapse" : "expand"} label={full ? "Half width" : "Full width"} onClick={() => onFull(!full)} />
                    <IconButton icon="close" label="Close" onClick={onClose} />
                </div>
            </header>
            <div className="aspis-inspector__body">{children}</div>
        </aside>
    );
}

/*
 * Labels in one column, values in the other. Fields placed inside lay themselves out as rows, so a form needs no
 * wrapper per field; FormRow gives the same row to anything that is not a field, and wide rows span both columns.
 */
export function Form({ children }: { children: ReactNode }) {
    return <div className="aspis-form">{children}</div>;
}

export function FormRow({ label, wide, children }: { label?: string; wide?: boolean; children: ReactNode }) {
    return (
        <>
            {label !== undefined && <span className="aspis-form__label">{label}</span>}
            <div className="aspis-form__value" data-wide={wide || label === undefined || undefined}>
                {children}
            </div>
        </>
    );
}
