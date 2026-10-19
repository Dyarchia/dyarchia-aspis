import { Button, EmptyState, IconButton, Menu, Page, Select, TextField, VisuallyHidden, useHotkeys } from "@dyarchia/aspis";
import { type KindId, kindIds, kinds, pieceAt } from "@dyarchia/library";
import { useMemo, useState } from "react";
import { useLibrary } from "../../use-library.ts";
import type { ServerState } from "../../use-server.ts";
import { Prompt, type PromptRequest } from "../kanban/Prompt.tsx";
import { LibraryConnect } from "../Settings.tsx";
import { Editor } from "./Editor.tsx";

const nameRule = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

/*
 * Two columns on one grid: the pieces of the chosen kind and the piece itself. Both columns share their first row,
 * so the kind and its + sit on the same line as the editor's modes and Save, and both columns start their content
 * on the same line below it. The publish cycle lives at the foot of the list and appears only when there is
 * something to publish or a pull request to follow. A piece made with the tutorial on opens in the tutorial.
 */
export function Build({ server, tutorial }: { server: ServerState; tutorial: boolean }) {
    const library = useLibrary(server);
    const [kind, setKind] = useState<KindId>("skills");
    const [selected, setSelected] = useState<string>();
    const [fresh, setFresh] = useState<string>();
    const [prompt, setPrompt] = useState<PromptRequest>();
    const [filter, setFilter] = useState("");
    const [repo, setRepo] = useState("");

    const pieces = useMemo(() => {
        const found = new Map<KindId, Set<string>>(kindIds.map((id) => [id, new Set<string>()]));
        for (const path of library.files) {
            const at = pieceAt(path);
            if (at) found.get(at.kind)!.add(at.name);
        }
        return found;
    }, [library.files]);
    const changed = new Set((library.status?.changes ?? []).map((change) => pieceAt(change.path)).filter(Boolean).map((at) => `${at!.kind}/${at!.name}`));
    const names = [...(pieces.get(kind) ?? [])].filter((name) => name.includes(filter.trim().toLowerCase())).sort();
    const current = kinds[kind];

    const create = () =>
        setPrompt({
            title: `New ${current.singular}`,
            label: "Name",
            hint: "Lowercase letters, digits and hyphens",
            action: "Create",
            validate: (name) =>
                !nameRule.test(name) ? "Only lowercase letters, digits and hyphens" : pieces.get(kind)?.has(name) ? `There is already a ${current.singular} named ${name}` : undefined,
            submit: async (name) => {
                for (const [path, content] of Object.entries(current.scaffold(name))) await library.write(path, content);
                setFresh(name);
                setSelected(name);
            },
        });

    const publish = () =>
        setPrompt({
            title: library.status?.pr?.state === "OPEN" ? "Add to the open pull request" : "Publish to the library",
            label: "What changed, in one line",
            action: "Publish",
            submit: (message) => void library.publish(message),
        });

    useHotkeys({ n: () => library.status && create() });

    if (!library.loaded) return <Page title="Build">{null}</Page>;

    if (!library.repo || !library.status)
        return (
            <Page title="Build">
                <EmptyState
                    title="Connect the GitHub repository that holds your library"
                    action={<LibraryConnect repo={repo} onRepo={setRepo} busy={library.busy} onConnect={() => void library.connect(repo.trim())} />}
                />
            </Page>
        );

    const status = library.status;
    const pr = status.pr;
    const count = status.changes.length;
    return (
        <Page title="Build">
            <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
                <div className="flex min-h-[var(--aspis-control-h)] items-center gap-[var(--aspis-space-2)] border-r border-[var(--aspis-line)] px-[var(--aspis-space-2)] pt-[var(--aspis-space-3)]">
                    <Select
                        label="Kind"
                        hideLabel
                        quiet
                        value={kind}
                        onChange={(event) => {
                            setKind(event.target.value as KindId);
                            setSelected(undefined);
                            setFilter("");
                        }}
                        options={kindIds.map((id) => ({ value: id, label: pieces.get(id)?.size ? `${kinds[id].label} · ${pieces.get(id)!.size}` : kinds[id].label }))}
                    />
                    <IconButton icon="plus" label={`New ${current.singular}`} hotkey="N" className="ml-auto" onClick={create} />
                </div>
                {selected ? (
                    <Editor
                        key={`${kind}/${selected}`}
                        kind={current}
                        name={selected}
                        library={library}
                        tutorial={tutorial}
                        start={tutorial && fresh === selected ? "tutorial" : "form"}
                        onDeleted={() => setSelected(undefined)}
                    />
                ) : (
                    <div className="col-start-2 row-start-2 min-h-0">
                        <EmptyState title={current.summary} />
                    </div>
                )}
                <section aria-label={current.label} className="col-start-1 row-start-2 flex min-h-0 flex-col border-r border-[var(--aspis-line)]">
                    <div className="px-[var(--aspis-space-2)] pt-[var(--aspis-space-3)]">
                        <TextField label={`Filter ${current.label.toLowerCase()}`} hideLabel placeholder="Filter" value={filter} onChange={(event) => setFilter(event.target.value)} />
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <Menu
                            label={current.label}
                            value={selected}
                            items={names.map((name) => ({ id: name, label: name, changed: changed.has(`${kind}/${name}`) }))}
                            onSelect={(name) => {
                                setFresh(undefined);
                                setSelected(name);
                            }}
                        />
                    </div>
                    {(count > 0 || pr) && (
                        <section aria-label="Publish" className="flex flex-col gap-[var(--aspis-space-3)] p-[var(--aspis-space-3)]">
                            {pr && (
                                <a href={pr.url} target="_blank" rel="noreferrer" className="aspis-field__hint flex min-h-[var(--aspis-row-h)] items-center">
                                    Pull request {pr.state.toLowerCase()}
                                    <VisuallyHidden>, opens GitHub</VisuallyHidden>
                                </a>
                            )}
                            {pr && pr.state !== "OPEN" && (
                                <Button variant="secondary" disabled={library.busy} onClick={() => void library.sync()}>
                                    Back to develop
                                </Button>
                            )}
                            {count > 0 && (
                                <Button variant="primary" disabled={library.busy} onClick={publish}>
                                    {pr?.state === "OPEN" ? "Update pull request" : `Publish ${count} change${count > 1 ? "s" : ""}`}
                                </Button>
                            )}
                        </section>
                    )}
                </section>
            </div>
            <Prompt request={prompt} onClose={() => setPrompt(undefined)} />
        </Page>
    );
}
