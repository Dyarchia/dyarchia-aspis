import type { ReactNode } from "react";

export interface MenuItem<T extends string> {
    id: T;
    label: ReactNode;
    count?: number;
    mark?: ReactNode;
}

export function Menu<T extends string>({ label, items, value, onSelect }: { label: string; items: readonly MenuItem<T>[]; value?: T; onSelect: (id: T) => void }) {
    return (
        <div className="aspis-menu">
            <ul className="aspis-menu__list" aria-label={label}>
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
        </div>
    );
}
