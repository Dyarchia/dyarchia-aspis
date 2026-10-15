import { Button, Chip, GroupHeader, Icon, TabPanel, Tabs, TextArea, VisuallyHidden, cx, useHotkeys, useToast } from "@dyarchia/aspis";
import { type Field, type Kind, read, validate, write } from "@dyarchia/library";
import { useEffect, useMemo, useState } from "react";
import type { Library } from "../../use-library.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { FieldControl } from "./FieldControl.tsx";

type Mode = "tutorial" | "form" | "code";

const modes = [
    { id: "tutorial", label: "Tutorial" },
    { id: "form", label: "Form" },
    { id: "code", label: "Code" },
] as const;

/*
 * One piece, three ways in. The file text is the only state: the form reads it and writes changes back
 * into it key by key, the code view edits it directly, and the tutorial is the same form walked one step at a time.
 * Saving writes the files to the library working tree; publishing is done from the header.
 */
export function Editor({ kind, name, library, onDeleted }: { kind: Kind; name: string; library: Library; onDeleted: () => void }) {
    const toast = useToast();
    const [mode, setMode] = useState<Mode>("form");
    const [step, setStep] = useState(0);
    const [path, setPath] = useState(kind.main(name));
    const [texts, setTexts] = useState<Record<string, string>>({});
    const [saved, setSaved] = useState<Record<string, string>>({});
    const [confirm, setConfirm] = useState(false);
    const [more, setMore] = useState<boolean>();

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

    useHotkeys({ "mod+s": () => dirty.length > 0 && void save() });

    const blank = (value: unknown) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    const extras = kind.fields.filter((field) => !kind.essentials.includes(field.key));
    const extrasInUse = extras.some((field) => !blank(reading.values[field.key]) || issues.some((issue) => issue.field === field.key));
    const extrasOpen = more ?? extrasInUse;

    const grid = (fields: readonly Field[], highlight: boolean) => (
        <div className="grid max-w-[880px] grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-x-[var(--aspis-space-5)] gap-y-[var(--aspis-space-4)]">
            {fields.map((field) => (
                <FieldControl key={field.key} field={field} value={reading.values[field.key]} highlight={highlight} onCommit={(value) => !reading.error && change(field.key, value)} />
            ))}
        </div>
    );

    const body = (highlight: boolean) =>
        kind.body && (
            <div className={cx("max-w-[880px]", highlight && "rounded-[var(--aspis-radius-control)] outline outline-2 outline-offset-4 outline-[var(--aspis-accent)]")}>
                <TextArea label={kind.body.label} hint={kind.body.help} rows={14} value={reading.body} onChange={(event) => change("body", event.target.value)} />
            </div>
        );

    /*
     * The form leads with the fields every piece of this kind needs and keeps the rest behind More options, open
     * on its own when one of them already holds a value or an issue. The tutorial shows only its step's fields.
     */
    const form = (keys?: readonly string[]) => (
        <div className="flex flex-col gap-[var(--aspis-space-5)]">
            {reading.error && <Chip tone="danger">The file does not parse: {reading.error}. Fix it in Code.</Chip>}
            {keys ? (
                <>
                    {grid(
                        kind.fields.filter((field) => keys.includes(field.key)),
                        true,
                    )}
                    {keys.includes("body") && body(true)}
                </>
            ) : (
                <>
                    {grid(
                        kind.fields.filter((field) => kind.essentials.includes(field.key)),
                        false,
                    )}
                    {kind.essentials.includes("body") && body(false)}
                    {extras.length > 0 && (
                        <div className="flex flex-col gap-[var(--aspis-space-4)]">
                            <Button variant="quiet" icon="chevron" className="w-fit" aria-expanded={extrasOpen} aria-controls="editor-more" onClick={() => setMore(!extrasOpen)}>
                                More options
                            </Button>
                            <div id="editor-more" hidden={!extrasOpen}>
                                {grid(extras, false)}
                            </div>
                        </div>
                    )}
                    {reading.extra.length > 0 && <span className="aspis-field__hint">Kept as written, edit them in Code: {reading.extra.join(", ")}</span>}
                </>
            )}
        </div>
    );

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-none flex-col gap-[var(--aspis-space-4)] border-b border-[var(--aspis-line)] px-[var(--aspis-space-5)] pt-[var(--aspis-space-4)] pb-[var(--aspis-space-3)]">
                <div className="flex flex-wrap items-center gap-[var(--aspis-space-3)]">
                    <h2 className="[font:var(--aspis-type-title)]">{name}</h2>
                    {errors.length > 0 && <Chip tone="danger">{errors.length} to fix</Chip>}
                    {dirty.length > 0 && <Chip tone="warn">unsaved</Chip>}
                    <div className="ml-auto flex gap-[var(--aspis-space-3)]">
                        {confirm ? (
                            <>
                                <Button variant="quiet" autoFocus onClick={() => setConfirm(false)}>
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
                <Tabs label="Mode" id="editor-mode" value={mode} onChange={setMode} tabs={modes} />
            </div>
            <TabPanel id="editor-mode" value={mode} className="min-h-0 flex-1 overflow-y-auto p-[var(--aspis-space-5)]">
                {mode === "tutorial" && current && (
                    <div className="grid grid-cols-[minmax(240px,320px)_minmax(0,1fr)] gap-[var(--aspis-space-6)]">
                        <div className="flex flex-col gap-[var(--aspis-space-4)]">
                            <GroupHeader label={`Step ${Math.min(step, kind.steps.length - 1) + 1} of ${kind.steps.length}`} />
                            <h3 className="m-0">{current.title}</h3>
                            <p className="m-0">{current.text}</p>
                            <a className="aspis-field__hint inline-flex w-fit items-center gap-[var(--aspis-space-1)]" href={current.source} target="_blank" rel="noreferrer">
                                Docs
                                <Icon name="external" size={12} />
                                <VisuallyHidden>, opens code.claude.com</VisuallyHidden>
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

                {mode === "form" && form()}

                {mode === "code" && (
                    <div className="flex h-full flex-col gap-[var(--aspis-space-4)]">
                        {files.length > 1 && <Tabs label="Files" value={path} onChange={setPath} tabs={files.map((file) => ({ id: file, label: file.split("/").slice(2).join("/") || file }))} />}
                        <CodeEditor
                            path={path}
                            value={texts[path] ?? ""}
                            onChange={(text) => setTexts((all) => ({ ...all, [path]: text }))}
                            onSave={() => dirty.length > 0 && void save()}
                        />
                    </div>
                )}
            </TabPanel>

            {issues.length > 0 && (
                <ul className="m-0 flex max-h-[30%] flex-none list-none flex-col gap-[var(--aspis-space-2)] overflow-y-auto border-t border-[var(--aspis-line)] px-[var(--aspis-space-5)] py-[var(--aspis-space-3)]">
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
