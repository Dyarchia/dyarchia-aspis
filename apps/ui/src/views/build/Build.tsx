import { Button, Chip, EmptyState, Menu, Page, PageHeader, TextField, VisuallyHidden, useHotkeys } from "@dyarchia/aspis";
import { type KindId, kindIds, kinds, pieceAt } from "@dyarchia/library";
import { useMemo, useState } from "react";
import { useLibrary } from "../../use-library.ts";
import type { ServerState } from "../../use-server.ts";
import { Prompt, type PromptRequest } from "../kanban/Prompt.tsx";
import { LibraryConnect } from "../Settings.tsx";
import { Editor } from "./Editor.tsx";

const nameRule = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

/*
 * The library on the left (kinds, then the pieces of the chosen kind), the piece in the middle, and the publish
 * cycle in the header: changes go to a feature branch and a pull request to develop that the user merges.
 */
export function Build({ server }: { server: ServerState }) {
    const library = useLibrary(server);
    const [kind, setKind] = useState<KindId>("skills");
    const [selected, setSelected] = useState<string>();
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

    if (!library.repo || !library.status)
        return (
            <Page head={<PageHeader title="Build" />}>
                <EmptyState
                    title="Connect the GitHub repository that holds your library"
                    action={<LibraryConnect repo={repo} onRepo={setRepo} busy={library.busy} onConnect={() => void library.connect(repo.trim())} />}
                />
            </Page>
        );

    const status = library.status;
    const pr = status.pr;
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-[var(--aspis-space-4)] p-[var(--aspis-space-4)]">
                <h1 className="aspis-sr" tabIndex={-1}>
                    Build
                </h1>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[var(--aspis-space-3)]">
                    <span className="aspis-tile__ref">{library.repo}</span>
                    <Chip>{status.branch}</Chip>
                    {pr && (
                        <a href={pr.url} target="_blank" rel="noreferrer" className="no-underline">
                            <Chip tone={pr.state === "OPEN" ? "info" : pr.state === "MERGED" ? "ok" : "idle"}>
                                pull request {pr.state.toLowerCase()}
                                <VisuallyHidden>, opens GitHub</VisuallyHidden>
                            </Chip>
                        </a>
                    )}
                    {status.changes.length > 0 && <span className="aspis-field__hint">{`${status.changes.length} unpublished change${status.changes.length > 1 ? "s" : ""}`}</span>}
                </div>
                {pr && pr.state !== "OPEN" && (
                    <Button variant="secondary" icon="history" disabled={library.busy} onClick={() => void library.sync()}>
                        Back to develop
                    </Button>
                )}
                <Button variant="primary" icon="arrow" disabled={library.busy || status.changes.length === 0} onClick={publish}>
                    {pr?.state === "OPEN" ? "Update pull request" : "Publish"}
                </Button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-[200px_260px_minmax(0,1fr)] border-t border-[var(--aspis-line)]">
                <div className="min-h-0 overflow-y-auto border-r border-[var(--aspis-line)]">
                    <Menu
                        label="Kinds"
                        value={kind}
                        items={kindIds.map((id) => ({ id, label: kinds[id].label, count: pieces.get(id)?.size ?? 0 }))}
                        onSelect={(id) => {
                            setKind(id);
                            setSelected(undefined);
                            setFilter("");
                        }}
                    />
                </div>
                <section aria-label={current.label} className="flex min-h-0 flex-col border-r border-[var(--aspis-line)]">
                    <div className="flex items-end gap-[var(--aspis-space-3)] p-[var(--aspis-space-4)]">
                        <div className="flex-1">
                            <TextField label={`Filter ${current.label.toLowerCase()}`} hideLabel placeholder="Filter" value={filter} onChange={(event) => setFilter(event.target.value)} />
                        </div>
                        <Button variant="secondary" icon="plus" hotkey="N" onClick={create}>
                            New
                        </Button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <Menu
                            label={current.label}
                            value={selected}
                            items={names.map((name) => ({ id: name, label: name, mark: changed.has(`${kind}/${name}`) ? <Chip tone="warn">changed</Chip> : undefined }))}
                            onSelect={setSelected}
                        />
                    </div>
                </section>
                <div className="min-h-0 overflow-y-auto">
                    {selected ? (
                        <Editor key={`${kind}/${selected}`} kind={current} name={selected} library={library} onDeleted={() => setSelected(undefined)} />
                    ) : (
                        <div className="p-[var(--aspis-gutter)]">
                            <EmptyState title={`${current.summary} Pick one or make a new one.`} />
                        </div>
                    )}
                </div>
            </div>
            <Prompt request={prompt} onClose={() => setPrompt(undefined)} />
        </div>
    );
}
