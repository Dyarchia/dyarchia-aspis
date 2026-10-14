import type { CSSProperties, ReactNode } from "react";
import { cx } from "./primitives.tsx";

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
    return (
        <header className="aspis-page-head">
            <h1 className="aspis-page-head__title" tabIndex={-1}>
                {title}
            </h1>
            {actions && <div className="aspis-page-head__actions">{actions}</div>}
        </header>
    );
}

export function Page({ head, children }: { head: ReactNode; children: ReactNode }) {
    return (
        <div className="aspis-page">
            {head}
            <div className="aspis-page__content">{children}</div>
        </div>
    );
}

export function GroupHeader({ label, count, actions }: { label: string; count?: number; actions?: ReactNode }) {
    return (
        <header className="aspis-group">
            <h2 className="aspis-group__label">{label}</h2>
            {count !== undefined && <span className="aspis-group__count">{count}</span>}
            {actions && <div className="aspis-group__actions">{actions}</div>}
        </header>
    );
}

export function Section({ label, count, actions, children, id }: { label: string; count?: number; actions?: ReactNode; children: ReactNode; id?: string }) {
    return (
        <section className="aspis-section" id={id}>
            {(["tl", "tr", "bl", "br"] as const).map((corner) => (
                <i key={corner} className="aspis-section__cross" data-corner={corner} aria-hidden="true" />
            ))}
            <GroupHeader label={label} count={count} actions={actions} />
            <div className="aspis-section__body">{children}</div>
        </section>
    );
}

export function Panel({
    title,
    meta,
    actions,
    flush,
    className,
    children,
}: {
    title?: string;
    meta?: ReactNode;
    actions?: ReactNode;
    flush?: boolean;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section className={cx("aspis-panel", className)}>
            <div className="aspis-panel__frame">
                {(title || actions) && (
                    <header className="aspis-panel__bar">
                        {title && <h3 className="aspis-panel__title">{title}</h3>}
                        {meta && <span className="aspis-panel__meta">{meta}</span>}
                        {actions && <div className="aspis-panel__actions">{actions}</div>}
                    </header>
                )}
                <div className="aspis-panel__body" data-flush={flush || undefined}>
                    {children}
                </div>
            </div>
        </section>
    );
}

export function StatGrid({ stats }: { stats: readonly { label: string; value: ReactNode }[] }) {
    return (
        <dl className="aspis-stats">
            {stats.map((stat) => (
                <div key={stat.label} className="aspis-stats__item">
                    <dt className="aspis-stats__label">{stat.label}</dt>
                    <dd className="aspis-stats__value">{stat.value}</dd>
                </div>
            ))}
        </dl>
    );
}

export function Bars({ title, unit, bars }: { title: string; unit?: string; bars: readonly { label: string; value: number; display?: string }[] }) {
    const top = Math.max(...bars.map((bar) => bar.value), 1);
    return (
        <figure className="aspis-bars">
            <figcaption className="aspis-bars__head">
                <span>{title}</span>
                {unit && <span>{unit}</span>}
            </figcaption>
            {bars.map((bar) => (
                <div key={bar.label} className="aspis-bars__row">
                    <span className="aspis-bars__label">{bar.label}</span>
                    <span className="aspis-bars__track" style={{ "--aspis-ratio": bar.value / top } as CSSProperties} aria-hidden="true" />
                    <span className="aspis-bars__value">{bar.display ?? bar.value}</span>
                </div>
            ))}
        </figure>
    );
}

export function MetaTree({ items }: { items: readonly { term: string; values: readonly ReactNode[] }[] }) {
    return (
        <dl className="aspis-meta">
            {items.map((item) => (
                <div key={item.term} className="aspis-meta__item">
                    <dt className="aspis-meta__term">{item.term}</dt>
                    {item.values.map((value, index) => (
                        <dd key={index} className="aspis-meta__value">
                            {value}
                        </dd>
                    ))}
                </div>
            ))}
        </dl>
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
