import { type DragEvent, type MouseEvent, type ReactNode, useEffect, useId, useRef } from "react";
import { Icon, VisuallyHidden, cx } from "./primitives.tsx";

export function Board({ children, label }: { children: ReactNode; label: string }) {
    return (
        <div className="aspis-board" role="region" aria-label={label}>
            {children}
        </div>
    );
}

export type DropState = "allowed" | "refused" | undefined;

/*
 * Folding swaps the head for a narrow strip and back. When that happens under the keyboard, focus follows to the
 * control that replaces the one just pressed instead of falling to the page.
 */
export function Column({
    title,
    count,
    actions,
    drop,
    folded,
    onFold,
    onDragOver,
    onDrop,
    children,
}: {
    title: string;
    count: number;
    actions?: ReactNode;
    drop?: DropState;
    folded?: boolean;
    onFold?: () => void;
    onDragOver?: (event: DragEvent<HTMLElement>) => void;
    onDrop?: (event: DragEvent<HTMLElement>) => void;
    children?: ReactNode;
}) {
    const toggle = useRef<HTMLButtonElement>(null);
    const refocus = useRef(false);
    useEffect(() => {
        if (!refocus.current) return;
        refocus.current = false;
        toggle.current?.focus();
    }, [folded]);
    const fold = () => {
        refocus.current = document.activeElement === toggle.current;
        onFold?.();
    };
    return (
        <section className="aspis-column" data-drop={drop} data-folded={folded || undefined} aria-label={title} onDragOver={onDragOver} onDrop={onDrop}>
            {folded ? (
                <button ref={toggle} type="button" className="aspis-column__strip" aria-expanded="false" aria-label={`Show ${title} (${count})`} onClick={fold}>
                    <span className="aspis-column__count">{count}</span>
                    <span className="aspis-column__title">{title}</span>
                </button>
            ) : (
                <>
                    <header className="aspis-column__head">
                        <h2 className="aspis-column__title">{title}</h2>
                        <span className="aspis-column__count">{count}</span>
                        {(actions || onFold) && (
                            <div className="aspis-column__actions">
                                {actions}
                                {onFold && (
                                    <button ref={toggle} type="button" className="aspis-column__fold" aria-expanded="true" aria-label={`Fold ${title}`} title={`Fold ${title}`} onClick={fold}>
                                        <Icon name="chevron" size={14} />
                                    </button>
                                )}
                            </div>
                        )}
                    </header>
                    <ol className="aspis-column__list">{children}</ol>
                </>
            )}
        </section>
    );
}

export function Tile({
    reference,
    title,
    meta,
    marks,
    note,
    active,
    draggable,
    onOpen,
    onDragStart,
    onDragEnd,
}: {
    reference: string;
    title: string;
    meta?: readonly ReactNode[];
    marks?: ReactNode;
    note?: string;
    active?: boolean;
    draggable?: boolean;
    onOpen: () => void;
    onDragStart?: (event: DragEvent<HTMLElement>) => void;
    onDragEnd?: () => void;
}) {
    const id = useId();
    const showMeta = Boolean(meta?.length || marks);
    const described = [`${id}-ref`, note && `${id}-note`, showMeta && `${id}-meta`].filter(Boolean).join(" ");
    return (
        <li className="aspis-column__item">
            <button
                type="button"
                className="aspis-tile"
                aria-current={active || undefined}
                aria-labelledby={`${id}-title`}
                aria-describedby={described}
                draggable={draggable}
                onClick={onOpen}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
            >
                <span id={`${id}-ref`} className="aspis-tile__ref">
                    {reference}
                </span>
                <span id={`${id}-title`} className="aspis-tile__title">
                    {title}
                </span>
                {note && (
                    <span id={`${id}-note`} className="aspis-tile__note">
                        {note}
                    </span>
                )}
                {showMeta && (
                    <span id={`${id}-meta`} className="aspis-tile__meta">
                        {meta?.map((item, index) => (
                            <span key={index}>{item}</span>
                        ))}
                        {marks && <span className="aspis-tile__marks">{marks}</span>}
                    </span>
                )}
            </button>
        </li>
    );
}

const markStates = { ok: ["✓", "passed"], no: ["✗", "failed"], pending: ["·", "pending"] } as const;

export function Mark({ ok, label, title }: { ok: boolean | null; label: string; title?: string }) {
    const state = ok === null ? "pending" : ok ? "ok" : "no";
    const [glyph, spoken] = markStates[state];
    return (
        <span className="aspis-mark" data-state={state} title={title}>
            <span className="aspis-mark__glyph" aria-hidden="true">
                {glyph}
            </span>
            {label}
            <VisuallyHidden>{spoken}</VisuallyHidden>
        </span>
    );
}

/*
 * A native modal dialog. showModal makes everything behind it inert and puts it on the top layer, so a second
 * dialog stacks over the first and Escape (the cancel event) only reaches the one on top. The effect depends on
 * `open` alone: data changing underneath re-renders the content but never moves focus. Focus starts on the box,
 * or on a control that asked for autoFocus, and goes back to the opener on close.
 */
export function Dialog({
    open,
    onClose,
    title,
    label,
    placement = "side",
    children,
    footer,
}: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    label?: string;
    placement?: "side" | "center";
    children: ReactNode;
    footer?: ReactNode;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const box = useRef<HTMLDivElement>(null);
    const close = useRef(onClose);
    close.current = onClose;
    const opener = useRef<Element | null>(null);
    if (!open) opener.current = null;
    else opener.current ??= document.activeElement;
    const titleId = useId();

    useEffect(() => {
        const element = dialog.current;
        if (!open || !element) return;
        const from = opener.current;
        const asked = element.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
        element.showModal();
        (asked ?? box.current)?.focus();
        return () => {
            if (element.open) element.close();
            if (from instanceof HTMLElement && from.isConnected) from.focus();
        };
    }, [open]);

    if (!open) return null;
    const named = typeof title === "string";
    return (
        <dialog
            ref={dialog}
            className="aspis-dialog"
            data-placement={placement}
            aria-labelledby={named ? titleId : undefined}
            aria-label={named ? undefined : label}
            onCancel={(event) => {
                event.preventDefault();
                close.current();
            }}
            onMouseDown={(event: MouseEvent<HTMLDialogElement>) => event.target === event.currentTarget && close.current()}
        >
            <div ref={box} className="aspis-dialog__box" tabIndex={-1}>
                <header className="aspis-dialog__head">
                    {named ? (
                        <h2 id={titleId} className="aspis-dialog__title">
                            {title}
                        </h2>
                    ) : (
                        <div className="aspis-dialog__title">{title}</div>
                    )}
                    <button type="button" className="aspis-dialog__close" aria-label="Close" onClick={() => close.current()}>
                        <Icon name="close" />
                    </button>
                </header>
                <div className="aspis-dialog__body">{children}</div>
                {footer && <footer className="aspis-dialog__foot">{footer}</footer>}
            </div>
        </dialog>
    );
}

export interface ThreadEntry {
    id: number | string;
    who: string;
    when: string;
    kind: string;
    text: ReactNode;
}

export function Thread({ entries, composer, className }: { entries: readonly ThreadEntry[]; composer?: ReactNode; className?: string }) {
    return (
        <div className={cx("aspis-thread", className)}>
            <ol className="aspis-thread__list">
                {entries.map((entry) => (
                    <li key={entry.id} className="aspis-thread__entry" data-kind={entry.kind}>
                        <span className="aspis-thread__who">{entry.who}</span>
                        <span className="aspis-thread__when">{entry.when}</span>
                        <span className="aspis-thread__text">{entry.text}</span>
                    </li>
                ))}
            </ol>
            {composer && <div className="aspis-thread__composer">{composer}</div>}
        </div>
    );
}
