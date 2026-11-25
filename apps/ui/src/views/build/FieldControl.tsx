import { Select, Switch, TextArea, TextField } from "@dyarchia/aspis";
import type { Field, Issue } from "@dyarchia/library";
import { useEffect, useState } from "react";

const listText = (value: unknown) => (Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : "");
const jsonText = (value: unknown) => (value === undefined ? "" : JSON.stringify(value, null, 2));

/*
 * One control per field kind. Text is committed as it is typed, so the file beside it follows every keystroke;
 * toggles and selects commit at once. Numbers, tag lists and JSON wait for blur, and a value the control cannot hold
 * (malformed JSON) is shown as typed and only committed when it reads back cleanly. A problem with the value shows
 * under its own field.
 */
export function FieldControl({ field, value, explain, issue, onCommit }: { field: Field; value: unknown; explain?: boolean; issue?: Issue; onCommit: (value: unknown) => void }) {
    const shown = field.control === "tags" ? listText(value) : field.control === "json" ? jsonText(value) : value === undefined || value === null ? "" : String(value);
    const [local, setLocal] = useState(shown);
    const [invalid, setInvalid] = useState<string>();
    useEffect(() => setLocal(shown), [shown]);

    const hint = explain ? field.help : undefined;
    const shared = { label: field.label, hint, error: invalid ?? issue?.message, required: field.required };
    const live = field.control === "text" || field.control === "textarea";
    const type = (next: string) => {
        setLocal(next);
        if (live) onCommit(next);
    };

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
    if (field.control === "toggle") control = <Switch label={field.label} hint={hint} checked={value === true} onChange={(checked) => onCommit(checked || undefined)} />;
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
                onChange={(event) => type(event.target.value)}
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
                onChange={(event) => type(event.target.value)}
                onBlur={commitText}
                onKeyDown={(event) => event.key === "Enter" && commitText()}
            />
        );
    return control;
}
