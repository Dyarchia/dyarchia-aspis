import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";
import { Icon, IconButton, cx } from "./primitives.tsx";
import { useSidebar } from "./shell.tsx";

export interface Crumb {
    label: string;
    onClick: () => void;
}

/*
 * A view in a desktop window, headed as shadcn's inset pages are: the sidebar toggle, a hairline, the trail of
 * places above this one and the view's own name, which is the page heading and takes focus when the view changes.
 * Tools follow the name and actions end the bar. The body never scrolls as a page; the panes inside it do.
 */
export function Page({ title, crumbs = [], tools, actions, children }: { title: string; crumbs?: readonly Crumb[]; tools?: ReactNode; actions?: ReactNode; children: ReactNode }) {
    const sidebar = useSidebar();
    return (
        <div className="aspis-page">
            <header className="aspis-page__bar">
                <IconButton icon="panel" label={sidebar.collapsed ? "Show the sidebar" : "Hide the sidebar"} hotkey="Ctrl B" onClick={sidebar.toggle} />
                <span className="aspis-page__rule" aria-hidden="true" />
                {crumbs.length > 0 && (
                    <nav className="aspis-crumbs" aria-label="Breadcrumb">
                        <ol>
                            {crumbs.map((crumb) => (
                                <li key={crumb.label}>
                                    <button type="button" className="aspis-crumbs__link" onClick={crumb.onClick}>
                                        {crumb.label}
                                    </button>
                                    <Icon name="next" size={14} />
                                </li>
                            ))}
                        </ol>
                    </nav>
                )}
                <h1 className="aspis-page__title" tabIndex={-1}>
                    {title}
                </h1>
                {tools}
                {actions && <div className="aspis-page__actions">{actions}</div>}
            </header>
            <div className="aspis-page__body">{children}</div>
        </div>
    );
}

/*
 * A card of the page grid. Its head names what it holds, with a quiet note on the right; the body scrolls on its
 * own; the foot carries its actions. Cards in one row share their height, so their heads, bodies and feet line up.
 */
export function Card({ title, meta, footer, className, children }: { title?: string; meta?: ReactNode; footer?: ReactNode; className?: string; children: ReactNode }) {
    return (
        <section className={cx("aspis-card", className)} aria-label={title}>
            {title && (
                <header className="aspis-card__head">
                    <h2 className="aspis-card__title">{title}</h2>
                    {meta && <span className="aspis-card__meta">{meta}</span>}
                </header>
            )}
            <div className="aspis-card__body">{children}</div>
            {footer && <footer className="aspis-card__foot">{footer}</footer>}
        </section>
    );
}

/*
 * The steps of a walk, side by side in equal cells: the ones behind are ticked, the current one is lit and
 * underlined, and any step can be visited again.
 */
export function Stepper({ label, steps, current, onSelect }: { label: string; steps: readonly string[]; current: number; onSelect: (step: number) => void }) {
    return (
        <ol className="aspis-stepper" aria-label={label} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.map((step, index) => (
                <li key={step}>
                    <button
                        type="button"
                        className="aspis-stepper__step"
                        data-state={index < current ? "done" : index === current ? "now" : undefined}
                        aria-current={index === current ? "step" : undefined}
                        onClick={() => onSelect(index)}
                    >
                        <span className="aspis-stepper__index">
                            {index + 1}
                            {index < current && <Icon name="check" size={12} />}
                        </span>
                        <span className="aspis-stepper__label">{step}</span>
                    </button>
                </li>
            ))}
        </ol>
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
