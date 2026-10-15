import type { ReactNode } from "react";

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
