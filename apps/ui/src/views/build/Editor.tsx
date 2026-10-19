import { Button, Chip, Form, FormRow, Icon, IconButton, Progress, TabPanel, Tabs, TextArea, VisuallyHidden, cx, useHotkeys, useToast } from "@dyarchia/aspis";
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
 * into it key by key, the code view edits it directly, and the tutorial walks the same fields one step at a time.
 * The editor fills the second column of Build's grid: its modes and Save on the shared first row, its body below,
 * as wide as one form, so Save always ends where the fields end. The list already names the piece and Save already
 * says whether anything changed, so neither is repeated here. Saving writes the files to the library working tree;
 * publishing is done in the list.
 */
export function Editor({
    kind,
    name,
    library,
    tutorial,
    start,
    onDeleted,
}: {
    kind: Kind;
    name: string;
    library: Library;
    tutorial: boolean;
    start: Mode;
    onDeleted: () => void;
}) {
    const toast = useToast();
    const [mode, setMode] = useState<Mode>(start);
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

    const rows = (fields: readonly Field[], explain: boolean) =>
        fields.map((field) => (
            <FieldControl key={field.key} field={field} value={reading.values[field.key]} explain={explain} onCommit={(value) => !reading.error && change(field.key, value)} />
        ));

    const body = (explain: boolean) =>
        kind.body && <TextArea label={kind.body.label} hint={explain ? kind.body.help : undefined} rows={14} value={reading.body} onChange={(event) => change("body", event.target.value)} />;

    /*
     * The form leads with the fields every piece of this kind needs and keeps the rest behind More options, open
     * on its own when one of them already holds a value or an issue. It keeps to labels, values and errors; the
     * explanations of each field appear in the tutorial, under the field they explain.
     */
    const form = (
        <Form>
            {reading.error && (
                <FormRow wide>
                    <Chip tone="danger">The file does not parse: {reading.error}. Fix it in Code.</Chip>
                </FormRow>
            )}
            {rows(
                kind.fields.filter((field) => kind.essentials.includes(field.key)),
                false,
            )}
            {kind.essentials.includes("body") && body(false)}
            {extras.length > 0 && (
                <FormRow wide>
                    <Button variant="quiet" icon="chevron" className="w-fit" aria-expanded={extrasOpen} aria-controls="editor-more" onClick={() => setMore(!extrasOpen)}>
                        More options
                    </Button>
                </FormRow>
            )}
            {extrasOpen && rows(extras, false)}
            {reading.extra.length > 0 && (
                <FormRow wide>
                    <span className="aspis-field__hint">Kept as written, edit them in Code: {reading.extra.join(", ")}</span>
                </FormRow>
            )}
        </Form>
    );

    /*
     * The tutorial is a guided walk: it opens on what this kind of piece is, then takes one step per screen with the
     * step's own fields and their explanations, and ends by handing over to the form.
     */
    const walk = [{ title: `What is a ${kind.singular}?`, text: kind.intro, fields: [] as readonly string[], source: kind.steps[0]?.source ?? "" }, ...kind.steps];
    const at = Math.min(step, walk.length - 1);
    const lesson = walk[at]!;
    const last = at === walk.length - 1;
    const guide = (
        <div className="flex flex-col gap-[var(--aspis-space-5)]">
            <div className="flex flex-col gap-[var(--aspis-space-3)]">
                <div className="flex items-center gap-[var(--aspis-space-3)]">
                    <span className="aspis-field__hint">{`Step ${at + 1} of ${walk.length}`}</span>
                    <Progress max={walk.length} value={at + 1} label="Tutorial progress" />
                </div>
                <h2 className="m-0 [font:var(--aspis-type-item)] font-semibold">{lesson.title}</h2>
                <p className="m-0">{lesson.text}</p>
                {lesson.source && (
                    <a className="aspis-field__hint inline-flex w-fit items-center gap-[var(--aspis-space-1)]" href={lesson.source} target="_blank" rel="noreferrer">
                        Read more
                        <Icon name="external" size={12} />
                        <VisuallyHidden>, opens code.claude.com</VisuallyHidden>
                    </a>
                )}
            </div>
            {lesson.fields.length > 0 && (
                <Form>
                    {rows(
                        kind.fields.filter((field) => lesson.fields.includes(field.key)),
                        true,
                    )}
                    {lesson.fields.includes("body") && body(true)}
                </Form>
            )}
            <div className="flex items-center gap-[var(--aspis-space-3)]">
                <Button variant="secondary" disabled={at === 0} onClick={() => setStep(at - 1)}>
                    Back
                </Button>
                {last ? (
                    <Button variant="primary" onClick={() => setMode("form")}>
                        Finish
                    </Button>
                ) : (
                    <Button variant="primary" onClick={() => setStep(at + 1)}>
                        Next
                    </Button>
                )}
            </div>
        </div>
    );

    const shown = tutorial ? modes : modes.filter((entry) => entry.id !== "tutorial");
    const active = !tutorial && mode === "tutorial" ? "form" : mode;

    return (
        <>
            <div className="col-start-2 row-start-1 flex min-h-[var(--aspis-control-h)] w-full max-w-[calc(var(--aspis-label-w)+var(--aspis-value-w)+3*var(--aspis-space-5))] items-center gap-[var(--aspis-space-3)] px-[var(--aspis-space-5)] pt-[var(--aspis-space-3)]">
                <Tabs label="Mode" id="editor-mode" value={active} onChange={setMode} tabs={shown} />
                <div className="ml-auto flex items-center gap-[var(--aspis-space-3)]">
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
                        <IconButton icon="trash" label={`Delete ${kind.singular}`} onClick={() => setConfirm(true)} />
                    )}
                    <Button variant="primary" hotkey="Ctrl S" disabled={dirty.length === 0} onClick={() => void save()}>
                        Save
                    </Button>
                </div>
            </div>
            <div className="col-start-2 row-start-2 flex min-h-0 w-full max-w-[calc(var(--aspis-label-w)+var(--aspis-value-w)+3*var(--aspis-space-5))] flex-col">
                <TabPanel id="editor-mode" value={active} className={cx("min-h-0 flex-1 overflow-y-auto px-[var(--aspis-space-5)] pt-[var(--aspis-space-3)] pb-[var(--aspis-space-5)]", active === "code" && "flex flex-col gap-[var(--aspis-space-3)]")}>
                    {active === "tutorial" && guide}
                    {active === "form" && form}
                    {active === "code" && (
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
                </TabPanel>

                {issues.length > 0 && (
                    <ul className="m-0 flex max-h-[30%] flex-none list-none flex-col gap-[var(--aspis-space-2)] overflow-y-auto px-[var(--aspis-space-5)] py-[var(--aspis-space-3)]">
                        {issues.map((issue, index) => (
                            <li key={index}>
                                <Chip tone={issue.level === "error" ? "danger" : "warn"}>{issue.level}</Chip> <span className="aspis-field__hint">{issue.message}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </>
    );
}
