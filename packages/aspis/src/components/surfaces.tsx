import type { ReactNode } from "react";

/*
 * A view in a desktop window: a fixed bar with the view's title, its controls and its actions, and a body that
 * fills the rest of the window. The body never scrolls as a page; the panes inside it scroll on their own.
 */
export function Page({ title, tools, actions, children }: { title: string; tools?: ReactNode; actions?: ReactNode; children: ReactNode }) {
    return (
        <div className="aspis-page">
            <header className="aspis-page-head">
                <h1 className="aspis-page-head__title" tabIndex={-1}>
                    {title}
                </h1>
                {tools && <div className="aspis-page-head__tools">{tools}</div>}
                {actions && <div className="aspis-page-head__actions">{actions}</div>}
            </header>
            <div className="aspis-page__body">{children}</div>
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
