import { type InputHTMLAttributes, type KeyboardEvent, type SelectHTMLAttributes, useId } from "react";
import { Icon, cx } from "./primitives.tsx";

interface FieldFrame {
    label: string;
    hint?: string;
}

export function TextField({ label, hint, className, id, ...rest }: FieldFrame & InputHTMLAttributes<HTMLInputElement>) {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
        <div className={cx("aspis-field", className)}>
            <label className="aspis-field__label" htmlFor={inputId}>
                {label}
            </label>
            <div className="aspis-field__control">
                <input id={inputId} className="aspis-field__input" {...rest} />
            </div>
            {hint && <p className="aspis-field__hint">{hint}</p>}
        </div>
    );
}

export function Select({
    label,
    hint,
    options,
    className,
    id,
    ...rest
}: FieldFrame & { options: readonly { value: string; label: string }[] } & SelectHTMLAttributes<HTMLSelectElement>) {
    const autoId = useId();
    const selectId = id ?? autoId;
    return (
        <div className={cx("aspis-field", className)}>
            <label className="aspis-field__label" htmlFor={selectId}>
                {label}
            </label>
            <div className="aspis-field__control" data-kind="select">
                <select id={selectId} className="aspis-field__input" {...rest}>
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <Icon name="chevron" className="aspis-field__chevron" />
            </div>
            {hint && <p className="aspis-field__hint">{hint}</p>}
        </div>
    );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
    return (
        <label className="aspis-switch">
            <button type="button" role="switch" aria-checked={checked} className="aspis-switch__track" onClick={() => onChange(!checked)}>
                <span className="aspis-switch__thumb" />
            </button>
            <span className="aspis-switch__label">{label}</span>
        </label>
    );
}

export interface TabItem<T extends string> {
    id: T;
    label: string;
    count?: number;
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly TabItem<T>[]; value: T; onChange: (id: T) => void; label: string }) {
    const move = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const index = tabs.findIndex((tab) => tab.id === value);
        const next = tabs[(index + step + tabs.length) % tabs.length]!;
        onChange(next.id);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
    };
    return (
        <div role="tablist" aria-label={label} className="aspis-tabs" onKeyDown={move}>
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    data-tab={tab.id}
                    aria-selected={tab.id === value}
                    tabIndex={tab.id === value ? 0 : -1}
                    className="aspis-tabs__tab"
                    onClick={() => onChange(tab.id)}
                >
                    {tab.label}
                    {tab.count !== undefined && <span className="aspis-tabs__count">{tab.count}</span>}
                </button>
            ))}
        </div>
    );
}
