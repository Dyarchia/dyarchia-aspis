import { Button, Chip, GroupHeader, Tabs, TextArea, useHotkeys, useToast } from "@dyarchia/aspis";
import { type Kind, read, validate, write } from "@dyarchia/library";
import { useEffect, useMemo, useState } from "react";
import type { Library } from "../../use-library.ts";
import { FieldControl } from "./FieldControl.tsx";

type Mode = "tutorial" | "declarative" | "code";

const modes = [
    { id: "tutorial", label: "Tutorial" },
    { id: "declarative", label: "Declarative" },
    { id: "code", label: "Code" },
] as const;

/*
 * One piece, three ways in. The file text is the only state: the declarative form reads it and writes changes back
 * into it key by key, the code view edits it directly, and the tutorial is the same form walked one step at a time.
 * Saving writes the files to the library working tree; publishing is done from the header.
 */
export function Editor({ kind, name, library, onDeleted }: { kind: Kind; name: string; library: Library; onDeleted: () => void }) {
    const toast = useToast();
    const [mode, setMode] = useState<Mode>("declarative");
    const [step, setStep] = useState(0);
    const [path, setPath] = useState(kind.main(name));
    const [texts, setTexts] = useState<Record<string, string>>({});
    const [saved, setSaved] = useState<Record<string, string>>({});
    const [confirm, setConfirm] = useState(false);

    const files = useMemo(() => library.files.filter((file) => kind.owns(file) === name), [library.files, kind, name]);
    const main = kind.main(name);

    useEffect(() => {
        let stale = false;
        void Promise.all(files.map(async (file) => [file, await library.read(file)] as const)).then((entries) => {
            if (stale) return;
            const loaded = Object.fromEntries(entries);
            setSaved(loaded);
            setTexts((current) => ({ ...loaded, ...Object.fromEntries(Object.entries(current).filter(([file, text]) => loaded[file] !== undefined && text !== saved[file])) }));
        });
        return () => {
            stale = true;
        };
    }, [files.join("|")]);

    const text = texts[main] ?? "";
    const reading = read(kind, text);
    const dirty = Object.keys(texts).filter((file) => texts[file] !== saved[file]);
    const issues = validate(kind, { kind: kind.id, name, path: main, text, files });
    const errors = issues.filter((issue) => issue.level === "error");
    const current = kind.steps[Math.min(step, kind.steps.length - 1)];

    const change = (key: string, value: unknown) => {
        try {
            setTexts((all) => ({ ...all, [main]: write(kind, all[main] ?? "", key, value as never) }));
        } catch (error) {
            toast({ text: error instanceof Error ? error.message : String(error), tone: "danger" });
        }
    };

    const save = async () => {
        for (const file of dirty) await library.write(file, texts[file]!);
        setSaved((before) => ({ ...before, ...Object.fromEntries(dirty.map((file) => [file, texts[file]!])) }));
    };

    useHotkeys({ "Ctrl+s": () => dirty.length > 0 && void save() });

    const form = (keys?: readonly string[]) => (
        <div className="flex flex-col gap-[var(--aspis-space-5)]">
            {reading.error && <Chip tone="danger">The file does not parse: {reading.error}. Fix it in Code.</Chip>}
            {kind.fields
                .filter((field) => !keys || keys.includes(field.key))
                .map((field) => (
                    <FieldControl key={field.key} field={field} value={reading.values[field.key]} highlight={Boolean(keys)} onCommit={(value) => !reading.error && change(field.key, value)} />
                ))}
            {kind.body && (!keys || keys.includes("body")) && (
                <div className={keys ? "rounded-[var(--aspis-radius-control)] outline outline-2 outline-offset-4 outline-[var(--aspis-accent)]" : ""}>
                    <TextArea label={kind.body.label} hint={kind.body.help} rows={14} value={reading.body} onChange={(event) => change("body", event.target.value)} />
                </div>
            )}
            {!keys && reading.extra.length > 0 && (
                <span className="aspis-field__hint">Kept as written, edit them in Code: {reading.extra.join(", ")}</span>
            )}
        </div>
    );

    return (
        <div className="flex flex-col gap-[var(--aspis-space-5)] p-[var(--aspis-gutter)]">
            <div className="flex flex-wrap items-center gap-[var(--aspis-space-3)]">
                <h2 className="m-0">{name}</h2>
                <Chip>{kind.singular}</Chip>
                {errors.length > 0 ? <Chip tone="danger">{errors.length} to fix</Chip> : <Chip tone="ok">valid</Chip>}
                {dirty.length > 0 && <Chip tone="warn">unsaved</Chip>}
                <div className="ml-auto flex gap-[var(--aspis-space-3)]">
                    {confirm ? (
                        <>
                            <Button variant="quiet" onClick={() => setConfirm(false)}>
                                Keep it
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={async () => {
                                    await library.remove(kind.root(name));
                                    onDeleted();
                                }}
                            >
                                Delete for good
                            </Button>
                        </>
                    ) : (
                        <Button variant="quiet" onClick={() => setConfirm(true)}>
                            Delete
                        </Button>
                    )}
                    <Button variant="primary" icon="check" hotkey="Ctrl S" disabled={dirty.length === 0} onClick={() => void save()}>
                        Save
                    </Button>
                </div>
            </div>
            <Tabs label="Mode" value={mode} onChange={setMode} tabs={modes} />

            {mode === "tutorial" && current && (
                <div className="grid grid-cols-[minmax(240px,320px)_minmax(0,1fr)] gap-[var(--aspis-space-6)]">
                    <div className="flex flex-col gap-[var(--aspis-space-4)]">
                        <GroupHeader label={`Step ${Math.min(step, kind.steps.length - 1) + 1} of ${kind.steps.length}`} />
                        <h3 className="m-0">{current.title}</h3>
                        <p className="m-0">{current.text}</p>
                        <a className="aspis-field__hint" href={current.source} target="_blank" rel="noreferrer">
                            Source: {current.source.replace(/^https:\/\//, "")}
                        </a>
                        <div className="flex gap-[var(--aspis-space-3)]">
                            <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
                                Back
                            </Button>
                            <Button variant="primary" disabled={step >= kind.steps.length - 1} onClick={() => setStep(step + 1)}>
                                Next
                            </Button>
                        </div>
                    </div>
                    {form(current.fields)}
                </div>
            )}

            {mode === "declarative" && form()}

            {mode === "code" && (
                <div className="flex flex-col gap-[var(--aspis-space-4)]">
                    {files.length > 1 && <Tabs label="Files" value={path} onChange={setPath} tabs={files.map((file) => ({ id: file, label: file.split("/").slice(2).join("/") || file }))} />}
                    <TextArea
                        label={path}
                        rows={26}
                        spellCheck={false}
                        className="font-[family-name:var(--aspis-font-mono)]"
                        value={texts[path] ?? ""}
                        onChange={(event) => setTexts((all) => ({ ...all, [path]: event.target.value }))}
                    />
                </div>
            )}

            {issues.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-[var(--aspis-space-2)] p-0">
                    {issues.map((issue, index) => (
                        <li key={index}>
                            <Chip tone={issue.level === "error" ? "danger" : "warn"}>{issue.level}</Chip> <span className="aspis-field__hint">{issue.message}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
