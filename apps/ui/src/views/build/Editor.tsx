import { Button, Card, Chip, CodeBlock, Icon, IconButton, Page, Stepper, TabPanel, Tabs, TextArea, useHotkeys, useToast } from "@dyarchia/aspis";
import { type Field, type Issue, type Kind, type Step, read, validate, write } from "@dyarchia/library";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { Library } from "../../use-library.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { FieldControl } from "./FieldControl.tsx";

type Mode = "guide" | "form" | "code";

const modes = [
    { id: "guide", label: "Guide" },
    { id: "form", label: "Form" },
    { id: "code", label: "Code" },
] as const;

const saveAfterMs = 600;

/*
 * How many cards fit side by side. A wide window gives each part of a step its own card instead of leaving the
 * width to empty margins: lesson, example, fields and file.
 */
function useColumns(ref: RefObject<HTMLElement | null>) {
    const [columns, setColumns] = useState(2);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => {
            const width = entry!.contentRect.width;
            setColumns(width >= 2200 ? 4 : width >= 1400 ? 3 : 2);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);
    return columns;
}

const inline = (text: string) =>
    text.split(/(`[^`]+`)/).map((part, index) =>
        part.startsWith("`") && part.endsWith("`") ? (
            <code key={index} className="rounded-[var(--aspis-radius-hint)] bg-[var(--aspis-fill)] px-1.5 py-px [font:var(--aspis-type-code)] text-[var(--aspis-ink-1)]">
                {part.slice(1, -1)}
            </code>
        ) : (
            part
        ),
    );

function Lesson({ step }: { step: Step }) {
    return (
        <div className="flex max-w-[72ch] flex-col gap-4">
            <h3 className="m-0 [font:var(--aspis-type-display)] tracking-[var(--aspis-tracking-display)]">{step.title}</h3>
            <p className="m-0 font-medium [font:var(--aspis-type-body)]">{inline(step.text)}</p>
            {step.body.map((paragraph, index) => (
                <p key={index} className="m-0 [font:var(--aspis-type-body)] text-[var(--aspis-ink-2)]">
                    {inline(paragraph)}
                </p>
            ))}
        </div>
    );
}

function Example({ step }: { step: Step }) {
    return (
        <>
            {step.example && (
                <div className="flex flex-col gap-2">
                    <CodeBlock wrap title={step.example.file} lang={step.example.lang} lines={step.example.code.split("\n").map((text) => ({ text }))} />
                    {step.example.note && <p className="m-0 [font:var(--aspis-type-ui)] text-[var(--aspis-ink-3)]">{inline(step.example.note)}</p>}
                </div>
            )}
            {step.pitfalls && step.pitfalls.length > 0 && (
                <section aria-label="Common mistakes" className="flex flex-col gap-2.5">
                    <h4 className="m-0 flex items-center gap-2 font-semibold">
                        <Icon name="alert" className="text-[var(--aspis-signal-warn)]" />
                        Common mistakes
                    </h4>
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {step.pitfalls.map((pitfall) => (
                            <li key={pitfall} className="flex gap-2.5 [font:var(--aspis-type-ui)] text-[var(--aspis-ink-2)]">
                                <span aria-hidden="true" className="mt-2 size-[5px] flex-none rounded-full bg-[var(--aspis-signal-warn)]" />
                                <span>{inline(pitfall)}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </>
    );
}

/*
 * The file as it is right now, line by line, with the lines the current step writes lit, so each answer shows up
 * where it lands. Frontmatter keys are matched at the start of their line, JSON keys as quoted names, and the body
 * of a markdown file is everything after its frontmatter.
 */
function FilePreview({ text, keys }: { text: string; keys: readonly string[] }) {
    const lines = text.split("\n");
    const close = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
    const starts = (line: string) => /^[\w-]+:/.test(line) || line === "---";
    const owner = (index: number) => {
        let at = index;
        while (at > 0 && !starts(lines[at]!) && (close < 0 || at < close)) at--;
        return lines[at]!;
    };
    const lit = (line: string, index: number) =>
        keys.some((key) =>
            key === "body" ? close >= 0 && index > close : line.includes(`"${key}"`) || ((close < 0 || index < close) && owner(index).startsWith(`${key}:`)),
        );
    return (
        <pre className="-m-[var(--aspis-space-5)] py-4 [font:var(--aspis-type-code)]">
            {lines.map((line, index) => (
                <div
                    key={index}
                    className={`grid min-h-5 grid-cols-[44px_minmax(0,1fr)] pr-4 whitespace-pre-wrap ${lit(line, index) ? "bg-[linear-gradient(90deg,var(--aspis-fill),transparent)] shadow-[inset_2px_0_0_var(--aspis-ink-1)]" : ""}`}
                >
                    <span className="pr-4 text-right text-[var(--aspis-ink-4)] select-none">{index + 1}</span>
                    <span>{line}</span>
                </div>
            ))}
        </pre>
    );
}

/*
 * One piece, three ways in, all writing the same text: the guide walks the kind's lesson one step at a time beside
 * the fields that step fills, the form holds every field, and the code is the file itself. Every change is saved to
 * the library a moment after it is made (Ctrl S saves at once), so there is no Save button; the sidebar marks what
 * is not published yet.
 */
export function Editor({
    kind,
    name,
    library,
    tutorial,
    start,
    actions,
    onUp,
    onDeleted,
}: {
    kind: Kind;
    name: string;
    library: Library;
    tutorial: boolean;
    start: Mode;
    actions: ReactNode;
    onUp: () => void;
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
    const grid = useRef<HTMLDivElement>(null);
    const columns = useColumns(grid);

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

    const dirty = Object.keys(texts).filter((file) => texts[file] !== saved[file]);
    const latest = useRef({ texts, dirty });
    latest.current = { texts, dirty };

    const save = async () => {
        const { texts: now, dirty: pending } = latest.current;
        if (pending.length === 0) return;
        for (const file of pending) await library.write(file, now[file]!);
        setSaved((before) => ({ ...before, ...Object.fromEntries(pending.map((file) => [file, now[file]!])) }));
    };

    useEffect(() => {
        if (dirty.length === 0) return;
        const timer = setTimeout(() => void save(), saveAfterMs);
        return () => clearTimeout(timer);
    }, [texts]);

    useEffect(() => () => void save(), []);

    const text = texts[main] ?? "";
    const reading = read(kind, text);
    const issues = validate(kind, { kind: kind.id, name, path: main, text, files });
    const steps = kind.steps;
    const at = Math.min(step, steps.length - 1);
    const lesson = steps[at]!;
    const last = at === steps.length - 1;
    const guiding = tutorial && mode === "guide";
    const active: Mode = !tutorial && mode === "guide" ? "form" : mode;

    const change = (key: string, value: unknown) => {
        try {
            setTexts((all) => ({ ...all, [main]: write(kind, all[main] ?? "", key, value as never) }));
        } catch (error) {
            toast({ text: error instanceof Error ? error.message : String(error), tone: "danger" });
        }
    };

    const next = () => (last ? setMode("form") : setStep(at + 1));
    useHotkeys({ "mod+s": () => void save(), "mod+enter": () => guiding && next() });

    const fieldIssue = (key: string) => issues.find((issue) => issue.field === key);
    const general = issues.filter((issue) => !issue.field || !kind.fields.some((field) => field.key === issue.field) && issue.field !== "body");
    const control = (field: Field, explain: boolean) => (
        <FieldControl key={field.key} field={field} value={reading.values[field.key]} explain={explain} issue={fieldIssue(field.key)} onCommit={(value) => !reading.error && change(field.key, value)} />
    );
    const body = (explain: boolean) =>
        kind.body && (
            <TextArea
                key="body"
                label={kind.body.label}
                hint={explain ? kind.body.help : undefined}
                error={fieldIssue("body")?.message}
                rows={12}
                value={reading.body}
                onChange={(event) => change("body", event.target.value)}
            />
        );
    const notes = (list: readonly Issue[]) =>
        list.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {list.map((issue, index) => (
                    <li key={index} className="flex items-center gap-2">
                        <Chip tone={issue.level === "error" ? "danger" : "warn"}>{issue.level}</Chip>
                        <span className="[font:var(--aspis-type-ui)] text-[var(--aspis-ink-2)]">{issue.message}</span>
                    </li>
                ))}
            </ul>
        );

    const stepFields = (
        <div className="flex flex-col gap-5">
            {kind.fields.filter((field) => lesson.fields.includes(field.key)).map((field) => control(field, true))}
            {lesson.fields.includes("body") && body(true)}
            {lesson.fields.length === 0 && <p className="m-0 text-[var(--aspis-ink-3)]">Nothing to fill in on this step.</p>}
        </div>
    );
    const walk = (
        <>
            <Button variant="secondary" disabled={at === 0} onClick={() => setStep(at - 1)}>
                Back
            </Button>
            <Button variant="primary" hotkey="Ctrl Enter" onClick={next}>
                {last ? "Finish" : "Continue"}
            </Button>
        </>
    );
    const source = (
        <a className="ml-auto inline-flex items-center gap-1 text-[var(--aspis-ink-3)] underline underline-offset-4" href={lesson.source} target="_blank" rel="noreferrer">
            {kind.label} in the Claude Code docs
            <Icon name="external" size={12} />
        </a>
    );
    const fileName = main.split("/").at(-1)!;
    const preview = (keys: readonly string[]) => (
        <Card title={fileName} meta={main.split("/").slice(0, -1).join("/")}>
            <FilePreview text={text} keys={keys} />
        </Card>
    );

    const extras = kind.fields.filter((field) => !kind.essentials.includes(field.key));
    const blank = (value: unknown) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    const extrasOpen = more ?? extras.some((field) => !blank(reading.values[field.key]) || fieldIssue(field.key));

    const guide = (
        <div
            className="grid min-h-0 flex-1 gap-4"
            style={{ gridTemplateColumns: columns === 2 ? "minmax(0, 3fr) minmax(0, 2fr)" : `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: "auto minmax(0, 1fr)" }}
        >
            <div className="col-span-full">
                <Stepper label={`${kind.label} tutorial`} steps={steps.map((entry) => entry.title)} current={at} onSelect={setStep} />
            </div>
            <Card title="Lesson" meta={`${at + 1} of ${steps.length}`} footer={columns === 2 ? <>{walk}{source}</> : source}>
                <Lesson step={lesson} />
                {columns < 4 && <Example step={lesson} />}
                {columns === 2 && stepFields}
            </Card>
            {columns === 4 && (
                <Card title="Example" meta={lesson.example?.file.split("/").at(-2)}>
                    <Example step={lesson} />
                </Card>
            )}
            {columns >= 3 && (
                <Card title={`Your ${kind.singular}`} meta={name} footer={walk}>
                    {stepFields}
                </Card>
            )}
            {preview(lesson.fields)}
        </div>
    );

    const form = (
        <div className="grid min-h-0 flex-1 gap-4" style={{ gridTemplateColumns: columns === 2 ? "minmax(0, 3fr) minmax(0, 2fr)" : `repeat(${columns}, minmax(0, 1fr))` }}>
            <Card title={`Your ${kind.singular}`} meta={name} className={columns === 2 ? undefined : columns === 3 ? "col-span-2" : "col-span-3"}>
                {reading.error && <Chip tone="danger">The file does not parse: {reading.error}. Fix it in Code.</Chip>}
                {notes(general)}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-x-6 gap-y-5">
                    {kind.fields.filter((field) => kind.essentials.includes(field.key)).map((field) => control(field, false))}
                    {kind.essentials.includes("body") && <div className="col-span-full">{body(false)}</div>}
                    {extras.length > 0 && (
                        <div className="col-span-full">
                            <Button variant="quiet" icon="chevron" aria-expanded={extrasOpen} onClick={() => setMore(!extrasOpen)}>
                                More options
                            </Button>
                        </div>
                    )}
                    {extrasOpen && extras.map((field) => control(field, false))}
                    {extrasOpen && !kind.essentials.includes("body") && kind.body && <div className="col-span-full">{body(false)}</div>}
                </div>
                {reading.extra.length > 0 && <p className="m-0 [font:var(--aspis-type-ui)] text-[var(--aspis-ink-3)]">Kept as written, edit them in Code: {reading.extra.join(", ")}</p>}
            </Card>
            {preview([])}
        </div>
    );

    const code = (
        <Card title={path} meta={files.length > 1 ? `${files.length} files` : undefined} footer={issues.length > 0 ? notes(issues) : undefined}>
            {files.length > 1 && <Tabs label="Files" value={path} onChange={setPath} tabs={files.map((file) => ({ id: file, label: file.split("/").slice(2).join("/") || file }))} />}
            <CodeEditor path={path} value={texts[path] ?? ""} onChange={(next) => setTexts((all) => ({ ...all, [path]: next }))} onSave={() => void save()} />
        </Card>
    );

    return (
        <Page
            title={name}
            crumbs={[
                { label: "Build", onClick: onUp },
                { label: kind.label, onClick: onUp },
            ]}
            actions={
                <>
                    <Tabs label="Mode" id="editor-mode" value={active} onChange={setMode} tabs={tutorial ? modes : modes.filter((entry) => entry.id !== "guide")} />
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
                    {actions}
                </>
            }
        >
            <TabPanel id="editor-mode" value={active} className="flex min-h-0 flex-1 flex-col px-4 pb-4">
                <div ref={grid} className="flex min-h-0 flex-1 flex-col">
                    {active === "guide" && guide}
                    {active === "form" && form}
                    {active === "code" && code}
                </div>
            </TabPanel>
        </Page>
    );
}
