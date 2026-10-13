import { type DragEvent, type ReactNode, useEffect, useRef } from "react";
import { Icon, cx } from "./primitives.tsx";

export function Board({ children, label }: { children: ReactNode; label: string }) {
    return (
        <div className="aspis-board" role="region" aria-label={label}>
            {children}
        </div>
    );
}

export type DropState = "allowed" | "refused" | undefined;

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
    return (
        <section className="aspis-column" data-drop={drop} data-folded={folded || undefined} aria-label={title} onDragOver={onDragOver} onDrop={onDrop}>
            {folded ? (
                <button type="button" className="aspis-column__strip" aria-expanded="false" aria-label={`Show ${title} (${count})`} onClick={onFold}>
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
                                    <button type="button" className="aspis-column__fold" aria-expanded="true" aria-label={`Fold ${title}`} title={`Fold ${title}`} onClick={onFold}>
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
    return (
        <li className="aspis-column__item">
            <button type="button" className="aspis-tile" aria-current={active || undefined} draggable={draggable} onClick={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                <span className="aspis-tile__ref">{reference}</span>
                <span className="aspis-tile__title">{title}</span>
                {note && <span className="aspis-tile__note">{note}</span>}
                {(meta?.length || marks) && (
                    <span className="aspis-tile__meta">
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

export function Mark({ ok, label, title }: { ok: boolean | null; label: string; title?: string }) {
    return (
        <span className="aspis-mark" data-state={ok === null ? "pending" : ok ? "ok" : "no"} title={title}>
            <span className="aspis-mark__glyph">{ok === null ? "·" : ok ? "✓" : "✗"}</span>
            {label}
        </span>
    );
}

export function Dialog({
    open,
    onClose,
    title,
    placement = "side",
    children,
    footer,
}: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    placement?: "side" | "center";
    children: ReactNode;
    footer?: ReactNode;
}) {
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        box.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                onClose();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            previous?.focus();
        };
    }, [open, onClose]);
    if (!open) return null;
    return (
        <div className="aspis-dialog" data-placement={placement} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <div ref={box} className="aspis-dialog__box" role="dialog" aria-modal="true" tabIndex={-1}>
                <header className="aspis-dialog__head">
                    <div className="aspis-dialog__title">{title}</div>
                    <button type="button" className="aspis-dialog__close" aria-label="Close" onClick={onClose}>
                        <Icon name="close" />
                    </button>
                </header>
                <div className="aspis-dialog__body">{children}</div>
                {footer && <footer className="aspis-dialog__foot">{footer}</footer>}
            </div>
        </div>
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
