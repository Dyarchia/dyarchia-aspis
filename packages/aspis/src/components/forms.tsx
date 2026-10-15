import { type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId } from "react";
import { Icon, cx } from "./primitives.tsx";

interface FieldFrame {
    label: string;
    hint?: string;
    error?: string;
    hideLabel?: boolean;
}

/*
 * Label, control and one line under it: the error when there is one, otherwise the hint. Both are tied to the
 * control with aria-describedby, and an error also marks it invalid, so a screen reader hears what the eye sees.
 */
function useField(id: string | undefined, { hint, error }: FieldFrame) {
    const auto = useId();
    const control = id ?? auto;
    const note = error ?? hint;
    const noteId = note ? `${control}-note` : undefined;
    return {
        control,
        described: { "aria-describedby": noteId, "aria-invalid": error ? true : undefined },
        note: note && (
            <p id={noteId} className="aspis-field__hint" data-tone={error ? "danger" : undefined}>
                {note}
            </p>
        ),
    };
}

function Label({ htmlFor, frame, required }: { htmlFor: string; frame: FieldFrame; required?: boolean }) {
    return (
        <label className={frame.hideLabel ? "aspis-sr" : "aspis-field__label"} htmlFor={htmlFor}>
            {frame.label}
            {required && <span aria-hidden="true"> *</span>}
        </label>
    );
}

export function TextField({ label, hint, error, hideLabel, className, id, ...rest }: FieldFrame & InputHTMLAttributes<HTMLInputElement>) {
    const field = useField(id, { label, hint, error });
    return (
        <div className={cx("aspis-field", className)}>
            <Label htmlFor={field.control} frame={{ label, hideLabel }} required={rest.required} />
            <div className="aspis-field__control">
                <input id={field.control} className="aspis-field__input" {...field.described} {...rest} />
            </div>
            {field.note}
        </div>
    );
}

export function TextArea({ label, hint, error, hideLabel, className, id, ...rest }: FieldFrame & TextareaHTMLAttributes<HTMLTextAreaElement>) {
    const field = useField(id, { label, hint, error });
    return (
        <div className={cx("aspis-field", className)}>
            <Label htmlFor={field.control} frame={{ label, hideLabel }} required={rest.required} />
            <div className="aspis-field__control" data-kind="area">
                <textarea id={field.control} className="aspis-field__input" {...field.described} {...rest} />
            </div>
            {field.note}
        </div>
    );
}

export function Select({
    label,
    hint,
    error,
    hideLabel,
    options,
    className,
    id,
    ...rest
}: FieldFrame & { options: readonly { value: string; label: string }[] } & SelectHTMLAttributes<HTMLSelectElement>) {
    const field = useField(id, { label, hint, error });
    return (
        <div className={cx("aspis-field", className)}>
            <Label htmlFor={field.control} frame={{ label, hideLabel }} required={rest.required} />
            <div className="aspis-field__control" data-kind="select">
                <select id={field.control} className="aspis-field__input" {...field.described} {...rest}>
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <Icon name="chevron" className="aspis-field__chevron" />
            </div>
            {field.note}
        </div>
    );
}

/*
 * A two-way choice where off has a name of its own (io and nyx) shows that name before the track; the switch is
 * still named by its on side, which is what checked means to a screen reader.
 */
export function Switch({ checked, onChange, label, off, hint }: { checked: boolean; onChange: (checked: boolean) => void; label: string; off?: string; hint?: string }) {
    const id = useId();
    return (
        <div className="aspis-field">
            <label className="aspis-switch">
                {off && (
                    <span className="aspis-switch__label" aria-hidden="true">
                        {off}
                    </span>
                )}
                <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    aria-labelledby={`${id}-label`}
                    aria-describedby={hint ? `${id}-hint` : undefined}
                    className="aspis-switch__track"
                    onClick={() => onChange(!checked)}
                >
                    <span className="aspis-switch__thumb" />
                </button>
                <span id={`${id}-label`} className="aspis-switch__label">
                    {label}
                </span>
            </label>
            {hint && (
                <p id={`${id}-hint`} className="aspis-field__hint">
                    {hint}
                </p>
            )}
        </div>
    );
}

export interface TabItem<T extends string> {
    id: T;
    label: string;
}

const keySteps: Record<string, (index: number, length: number) => number> = {
    ArrowRight: (index, length) => (index + 1) % length,
    ArrowDown: (index, length) => (index + 1) % length,
    ArrowLeft: (index, length) => (index - 1 + length) % length,
    ArrowUp: (index, length) => (index - 1 + length) % length,
    Home: () => 0,
    End: (_, length) => length - 1,
};

/*
 * A row of tabs that switches the panel rendered by TabPanel with the same id. One tab is in the tab order and the
 * arrow keys, Home and End move between them.
 */
export function Tabs<T extends string>({
    tabs,
    value,
    onChange,
    label,
    id,
}: {
    tabs: readonly TabItem<T>[];
    value: T;
    onChange: (id: T) => void;
    label: string;
    id?: string;
}) {
    const move = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = keySteps[event.key];
        if (!step) return;
        event.preventDefault();
        const next = tabs[step(Math.max(tabs.findIndex((tab) => tab.id === value), 0), tabs.length)]!;
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
                    id={id && `${id}-${tab.id}`}
                    data-tab={tab.id}
                    aria-selected={tab.id === value}
                    aria-controls={id && `${id}-panel`}
                    tabIndex={tab.id === value ? 0 : -1}
                    className="aspis-tabs__tab"
                    onClick={() => onChange(tab.id)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}

export function TabPanel({ id, value, className, children }: { id: string; value: string; className?: string; children: ReactNode }) {
    return (
        <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`} className={className}>
            {children}
        </div>
    );
}
