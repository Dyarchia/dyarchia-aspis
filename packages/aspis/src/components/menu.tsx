import type { ReactNode } from "react";

export interface MenuItem<T extends string> {
    id: T;
    label: ReactNode;
    count?: number;
    mark?: ReactNode;
}

/* A vertical list to pick one thing from: the kinds of a library, the pieces of a kind. */
export function Menu<T extends string>({ label, items, value, onSelect }: { label: string; items: readonly MenuItem<T>[]; value?: T; onSelect: (id: T) => void }) {
    return (
        <nav className="aspis-menu" aria-label={label}>
            <ul className="aspis-menu__list">
                {items.map((item) => (
                    <li key={item.id}>
                        <button type="button" className="aspis-menu__item" aria-current={item.id === value || undefined} onClick={() => onSelect(item.id)}>
                            <span className="aspis-menu__label">{item.label}</span>
                            {item.mark}
                            {item.count !== undefined && <span className="aspis-menu__count">{item.count}</span>}
                        </button>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
