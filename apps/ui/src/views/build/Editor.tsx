import { Button, Chip, Icon, TabPanel, Tabs, TextArea, VisuallyHidden, cx, useHotkeys, useToast } from "@dyarchia/aspis";
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
 * Everything sits in one column, actions included, so Save stays beside what it saves on any window width. The
 * list already names the piece and Save already says whether anything changed, so neither is repeated here.
 * Saving writes the files to the library working tree; publishing is done under the kinds.
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-x-[var(--aspis-space-5)] gap-y-[var(--aspis-space-4)]">
            {fields.map((field) => (
                <FieldControl key={field.key} field={field} value={reading.values[field.key]} highlight={highlight} onCommit={(value) => !reading.error && change(field.key, value)} />
            ))}
        </div>
    );

    const body = (highlight: boolean) =>
        kind.body && (
            <div className={cx(highlight && "rounded-[var(--aspis-radius-control)] outline outline-2 outline-offset-4 outline-[var(--aspis-accent)]")}>
                <TextArea label={kind.body.label} hint={highlight ? kind.body.help : undefined} rows={14} value={reading.body} onChange={(event) => change("body", event.target.value)} />
            </div>
        );

    /*
     * The form leads with the fields every piece of this kind needs and keeps the rest behind More options, open
     * on its own when one of them already holds a value or an issue. The tutorial shows only its step's fields and
     * is the one place their explanations appear; the form keeps to labels, values and errors.
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
            <div className="flex max-w-[calc(880px+2*var(--aspis-space-5))] flex-none items-center gap-[var(--aspis-space-3)] px-[var(--aspis-space-5)] pt-[var(--aspis-space-3)]">
                <Tabs label="Mode" id="editor-mode" value={mode} onChange={setMode} tabs={modes} />
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
                    <Button variant="primary" hotkey="Ctrl S" disabled={dirty.length === 0} onClick={() => void save()}>
                        Save
                    </Button>
                </div>
            </div>
            <TabPanel id="editor-mode" value={mode} className="min-h-0 flex-1 overflow-y-auto p-[var(--aspis-space-5)]">
                <div className={cx("flex max-w-[880px] flex-col gap-[var(--aspis-space-5)]", mode === "code" && "h-full")}>
                    {mode === "tutorial" && current && (
                        <>
                            <div className="flex flex-col gap-[var(--aspis-space-3)]">
                                <span className="aspis-field__hint">{`Step ${Math.min(step, kind.steps.length - 1) + 1} of ${kind.steps.length}`}</span>
                                <h2 className="m-0 [font:var(--aspis-type-item)] font-semibold">{current.title}</h2>
                                <p className="m-0">{current.text}</p>
                                <div className="flex items-center gap-[var(--aspis-space-3)]">
                                    <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
                                        Back
                                    </Button>
                                    <Button variant="primary" disabled={step >= kind.steps.length - 1} onClick={() => setStep(step + 1)}>
                                        Next
                                    </Button>
                                    <a className="aspis-field__hint ml-auto inline-flex items-center gap-[var(--aspis-space-1)]" href={current.source} target="_blank" rel="noreferrer">
                                        Docs
                                        <Icon name="external" size={12} />
                                        <VisuallyHidden>, opens code.claude.com</VisuallyHidden>
                                    </a>
                                </div>
                            </div>
                            {form(current.fields)}
                        </>
                    )}

                    {mode === "form" && form()}

                    {mode === "code" && (
                        <>
                            {files.length > 1 && <Tabs label="Files" value={path} onChange={setPath} tabs={files.map((file) => ({ id: file, label: file.split("/").slice(2).join("/") || file }))} />}
                            <CodeEditor
                                path={path}
                                value={texts[path] ?? ""}
                                onChange={(text) => setTexts((all) => ({ ...all, [path]: text }))}
                                onSave={() => dirty.length > 0 && void save()}
                            />
                        </>
                    )}
                </div>
            </TabPanel>

            {issues.length > 0 && (
                <ul className="m-0 flex max-h-[30%] max-w-[calc(880px+2*var(--aspis-space-5))] flex-none list-none flex-col gap-[var(--aspis-space-2)] overflow-y-auto px-[var(--aspis-space-5)] py-[var(--aspis-space-3)]">
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
