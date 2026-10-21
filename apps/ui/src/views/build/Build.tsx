import { Button, Card, EmptyState, Icon, IconButton, Page, useHotkeys } from "@dyarchia/aspis";
import { type KindId, kindIds, kinds, pieceAt } from "@dyarchia/library";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { Library } from "../../use-library.ts";
import { Prompt, type PromptRequest } from "../kanban/Prompt.tsx";
import { LibraryConnect } from "../Settings.tsx";
import { Editor } from "./Editor.tsx";
import { type Selection, nameRule, piecesOf } from "./pieces.ts";

const changeLabels = { added: "Added", modified: "Changed", deleted: "Deleted" } as const;

/*
 * Build has no list of its own: the sidebar holds the library as folders and files. With nothing open it shows the
 * library at a glance, one card per kind and the changes waiting to be published; with a piece open it is that
 * piece's editor. Publishing is the one primary action, at the end of the bar, whatever is open. A piece made with
 * the tutorial on opens in the guide.
 */
export function Build({
    library,
    selection,
    onSelect,
    creating,
    onCreated,
    tutorial,
}: {
    library: Library;
    selection?: Selection;
    onSelect: (selection?: Selection) => void;
    creating?: KindId;
    onCreated: () => void;
    tutorial: boolean;
}) {
    const [prompt, setPrompt] = useState<PromptRequest>();
    const [fresh, setFresh] = useState<string>();
    const [repo, setRepo] = useState("");
    const pieces = useMemo(() => piecesOf(library.files), [library.files]);

    const create = (kind: KindId) => {
        const current = kinds[kind];
        setPrompt({
            title: `New ${current.singular}`,
            label: "Name",
            hint: "Lowercase letters, digits and hyphens",
            action: "Create",
            validate: (name) =>
                !nameRule.test(name) ? "Only lowercase letters, digits and hyphens" : pieces.get(kind)?.includes(name) ? `There is already a ${current.singular} named ${name}` : undefined,
            submit: async (name) => {
                for (const [path, content] of Object.entries(current.scaffold(name))) await library.write(path, content);
                setFresh(`${kind}/${name}`);
                onSelect({ kind, name });
            },
        });
    };

    useEffect(() => {
        if (!creating) return;
        create(creating);
        onCreated();
    }, [creating]);

    useHotkeys({ n: () => library.status && create(selection?.kind ?? "skills") });

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

    const pr = library.status.pr;
    const count = library.status.changes.length;
    const publish = () =>
        setPrompt({
            title: pr?.state === "OPEN" ? "Add to the open pull request" : "Publish to the library",
            label: "What changed, in one line",
            action: "Publish",
            submit: (message) => void library.publish(message),
        });
    const actions = (
        <>
            {pr && pr.state !== "OPEN" && (
                <Button variant="secondary" disabled={library.busy} onClick={() => void library.sync()}>
                    Back to develop
                </Button>
            )}
            <Button variant="primary" disabled={library.busy || count === 0} onClick={publish}>
                {pr?.state === "OPEN" ? "Update pull request" : "Publish"}
                {count > 0 && <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-[color-mix(in_srgb,var(--aspis-invert-ink)_12%,transparent)] px-1.5 [font:var(--aspis-type-data)]">{count}</span>}
            </Button>
        </>
    );
    const key = selection && `${selection.kind}/${selection.name}`;

    return (
        <>
            {selection && pieces.get(selection.kind)?.includes(selection.name) ? (
                <Editor
                    key={key}
                    kind={kinds[selection.kind]}
                    name={selection.name}
                    library={library}
                    tutorial={tutorial}
                    start={tutorial && fresh === key ? "guide" : "form"}
                    actions={actions}
                    onUp={() => onSelect(undefined)}
                    onDeleted={() => onSelect(undefined)}
                />
            ) : (
                <Overview library={library} pieces={pieces} actions={actions} onCreate={create} onOpen={onSelect} />
            )}
            <Prompt request={prompt} onClose={() => setPrompt(undefined)} />
        </>
    );
}

function Overview({
    library,
    pieces,
    actions,
    onCreate,
    onOpen,
}: {
    library: Library;
    pieces: Map<KindId, string[]>;
    actions: ReactNode;
    onCreate: (kind: KindId) => void;
    onOpen: (selection: Selection) => void;
}) {
    const status = library.status!;
    const changed = status.changes
        .map((change) => ({ ...change, at: pieceAt(change.path) }))
        .filter((change) => change.at !== undefined);
    return (
        <Page title="Build" actions={actions}>
            <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-[auto_auto_minmax(0,1fr)] gap-4 px-4 pb-4">
                {kindIds.map((id) => (
                    <Card key={id}>
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-[var(--aspis-ink-2)]">
                                <Icon name="folder" />
                                <span className="font-medium">{kinds[id].label}</span>
                                <IconButton icon="plus" label={`New ${kinds[id].singular}`} className="ml-auto" onClick={() => onCreate(id)} />
                            </div>
                            <span className="[font:var(--aspis-type-display)]">{pieces.get(id)?.length ?? 0}</span>
                            <p className="m-0 text-[var(--aspis-ink-3)]">{kinds[id].summary}</p>
                        </div>
                    </Card>
                ))}
                <Card
                    title="Changes not published"
                    className="col-span-4"
                    meta={
                        status.pr ? (
                            <a href={status.pr.url} target="_blank" rel="noreferrer">
                                Pull request {status.pr.state.toLowerCase()}
                            </a>
                        ) : (
                            status.branch
                        )
                    }
                >
                    {changed.length === 0 ? (
                        <p className="m-0 text-[var(--aspis-ink-3)]">Everything in the library is published.</p>
                    ) : (
                        <table className="-mx-[var(--aspis-space-5)] -mt-[var(--aspis-space-5)] w-[calc(100%+2*var(--aspis-space-5))] border-collapse">
                            <thead>
                                <tr className="h-10 bg-[var(--aspis-surface-deep)] text-left text-[var(--aspis-ink-3)]">
                                    {["Piece", "Kind", "Change", "File"].map((head) => (
                                        <th key={head} className="border-b border-[var(--aspis-line)] px-[var(--aspis-space-5)] font-medium">
                                            {head}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {changed.map((change) => (
                                    <tr key={change.path} className="h-12 border-b border-[var(--aspis-line)]">
                                        <td className="px-[var(--aspis-space-5)]">
                                            {change.status === "deleted" ? (
                                                change.at!.name
                                            ) : (
                                                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-[var(--aspis-ink-1)] hover:underline" onClick={() => onOpen(change.at!)}>
                                                    {change.at!.name}
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-[var(--aspis-space-5)] text-[var(--aspis-ink-3)] capitalize">{kinds[change.at!.kind].singular}</td>
                                        <td className="px-[var(--aspis-space-5)]">{changeLabels[change.status]}</td>
                                        <td className="px-[var(--aspis-space-5)] [font:var(--aspis-type-data)] text-[var(--aspis-ink-3)]">{change.path}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </Card>
            </div>
        </Page>
    );
}
