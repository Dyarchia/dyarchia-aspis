import { Select, Switch, TextArea, TextField, cx } from "@dyarchia/aspis";
import type { Field } from "@dyarchia/library";
import { useEffect, useState } from "react";

const listText = (value: unknown) => (Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : "");
const jsonText = (value: unknown) => (value === undefined ? "" : JSON.stringify(value, null, 2));

/*
 * One control per field kind. Text edits are committed on blur so the file is rewritten once per change, not per
 * keystroke; toggles and selects commit at once. A value the control cannot hold (a tag list written as a string,
 * malformed JSON) is shown as typed and only committed when it reads back cleanly.
 */
export function FieldControl({ field, value, highlight, onCommit }: { field: Field; value: unknown; highlight?: boolean; onCommit: (value: unknown) => void }) {
    const shown = field.control === "tags" ? listText(value) : field.control === "json" ? jsonText(value) : value === undefined || value === null ? "" : String(value);
    const [local, setLocal] = useState(shown);
    const [invalid, setInvalid] = useState<string>();
    useEffect(() => setLocal(shown), [shown]);

    const shared = { label: field.label, hint: field.help, error: invalid, required: field.required };

    const commitText = () => {
        if (local === shown) return;
        if (field.control === "number") return onCommit(local.trim() === "" ? undefined : Number(local));
        if (field.control === "tags")
            return onCommit(
                local
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
            );
        if (field.control === "json") {
            if (!local.trim()) return onCommit(undefined);
            try {
                setInvalid(undefined);
                return onCommit(JSON.parse(local));
            } catch (error) {
                return setInvalid(`Not valid JSON yet: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        onCommit(local);
    };

    let control;
    if (field.control === "toggle") control = <Switch label={field.label} hint={field.help} checked={value === true} onChange={(checked) => onCommit(checked || undefined)} />;
    else if (field.control === "select")
        control = (
            <Select
                {...shared}
                value={value === undefined ? "" : String(value)}
                onChange={(event) => onCommit(event.target.value || undefined)}
                options={[{ value: "", label: "Not set" }, ...(field.options ?? []).map((option) => ({ value: option, label: option }))]}
            />
        );
    else if (field.control === "textarea" || field.control === "json")
        control = (
            <TextArea
                {...shared}
                rows={field.control === "json" ? 6 : 3}
                placeholder={field.placeholder}
                value={local}
                onChange={(event) => setLocal(event.target.value)}
                onBlur={commitText}
            />
        );
    else
        control = (
            <TextField
                {...shared}
                type={field.control === "number" ? "number" : "text"}
                placeholder={field.placeholder ?? (field.control === "tags" ? "Comma separated" : undefined)}
                value={local}
                onChange={(event) => setLocal(event.target.value)}
                onBlur={commitText}
                onKeyDown={(event) => event.key === "Enter" && commitText()}
            />
        );
    return (
        <div
            className={cx(
                highlight && "rounded-[var(--aspis-radius-item)] outline outline-2 outline-offset-4 outline-[var(--aspis-accent)]",
                (field.control === "textarea" || field.control === "json") && "col-span-full",
            )}
            data-field={field.key}
        >
            {control}
        </div>
    );
}
