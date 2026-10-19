import { Select, TextArea, TextField } from "@dyarchia/aspis";
import { type Runner, efforts, harnesses } from "@dyarchia/core";
import { useEffect, useRef, useState } from "react";

export function LiveField({
    label,
    value,
    onCommit,
    disabled,
    type = "text",
    multiline,
    placeholder,
    hideLabel,
}: {
    label: string;
    value: string;
    onCommit: (value: string) => void;
    disabled: boolean;
    type?: string;
    multiline?: boolean;
    placeholder?: string;
    hideLabel?: boolean;
}) {
    const [local, setLocal] = useState(value);
    const editing = useRef(false);
    useEffect(() => {
        if (!editing.current) setLocal(value);
    }, [value]);
    const shared = {
        label,
        hideLabel,
        value: local,
        disabled,
        placeholder,
        onFocus: () => (editing.current = true),
        onBlur: () => {
            editing.current = false;
            if (local !== value) onCommit(local);
        },
    };
    return multiline ? (
        <TextArea {...shared} onChange={(event) => setLocal(event.target.value)} />
    ) : (
        <TextField {...shared} type={type} onChange={(event) => setLocal(event.target.value)} />
    );
}

export function RunnerFields({ label, runner, disabled, onCommit }: { label: string; runner: Runner; disabled: boolean; onCommit: (runner: Runner) => void }) {
    return (
        <div className="grid grid-cols-3 gap-[var(--aspis-space-4)]">
            <Select
                label={`${label} harness`}
                hideLabel
                value={runner.harness ?? ""}
                disabled={disabled}
                onChange={(event) => onCommit({ ...runner, harness: event.target.value || null })}
                options={[{ value: "", label: "Not set" }, ...harnesses.map((harness) => ({ value: harness, label: harness }))]}
            />
            <LiveField label={`${label} model`} hideLabel value={runner.model ?? ""} disabled={disabled} onCommit={(model) => onCommit({ ...runner, model: model.trim() || null })} />
            <Select
                label={`${label} effort`}
                hideLabel
                value={runner.effort ?? ""}
                disabled={disabled}
                onChange={(event) => onCommit({ ...runner, effort: event.target.value || null })}
                options={[{ value: "", label: "Default" }, ...efforts.map((effort) => ({ value: effort, label: effort }))]}
            />
        </div>
    );
}

export function RunnerHeads() {
    return (
        <div className="grid grid-cols-3 gap-[var(--aspis-space-4)]" aria-hidden="true">
            <span className="aspis-field__hint">Harness</span>
            <span className="aspis-field__hint">Model</span>
            <span className="aspis-field__hint">Effort</span>
        </div>
    );
}
