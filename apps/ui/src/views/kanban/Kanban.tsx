import { Board, Button, Column, type DropState, Mark, Select, TextField, Tile, useHotkeys } from "@dyarchia/aspis";
import { type Card, type Phase, type Target, phaseLabels, phases, targets } from "@dyarchia/core";
import { useMemo, useState } from "react";
import type { ServerState } from "../../use-server.ts";
import { CardPanel } from "./CardPanel.tsx";
import { Prompt, type PromptRequest } from "./Prompt.tsx";
import { useBoard } from "./use-board.ts";

const allRepos = "*";
const folderName = (folder: string) => folder.split(/[\\/]/).filter(Boolean).at(-1) ?? folder;
const when = (at: number) => new Date(at).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function Kanban({ server }: { server: ServerState }) {
    const board = useBoard(server);
    const [repo, setRepo] = useState(allRepos);
    const [query, setQuery] = useState("");
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState("");
    const [open, setOpen] = useState<number>();
    const [dragged, setDragged] = useState<Card>();
    const [prompt, setPrompt] = useState<PromptRequest>();

    const cards = board.cards ?? [];
    const phaseOf = useMemo(() => new Map(cards.map((card) => [card.id, card.phase])), [cards]);
    const repos = useMemo(() => [...new Set(cards.map((card) => card.folder).filter((folder): folder is string => Boolean(folder)))].sort(), [cards]);
    const needle = query.trim().toLowerCase();
    const visible = cards.filter(
        (card) => (repo === allRepos || card.folder === repo) && (!needle || `#${card.id} ${card.title} ${card.brief}`.toLowerCase().includes(needle)),
    );
    const humanTargets = (card: Card): Target[] =>
        targets(card, { actor: "human", now: Date.now(), dependencies: card.dependsOn.map((id) => phaseOf.get(id) ?? "archived") });
    const dropTargets = dragged ? humanTargets(dragged) : [];
    const dropState = (phase: Phase): DropState => {
        if (!dragged || phase === dragged.phase) return undefined;
        const target = dropTargets.find((candidate) => candidate.to === phase);
        return target && !target.reason ? "allowed" : "refused";
    };

    const moveCard = (card: Card, target: Target) => {
        if (target.reason) return;
        if (!target.note) return void board.move(card.id, { to: target.to });
        setPrompt({
            title: `#${card.id} to ${phaseLabels[target.to]}`,
            label: target.note,
            action: `Move to ${phaseLabels[target.to]}`,
            submit: (note) => void board.move(card.id, { to: target.to, note }),
        });
    };

    const drop = (phase: Phase) => {
        const card = dragged;
        setDragged(undefined);
        if (!card || phase === card.phase) return;
        const target = humanTargets(card).find((candidate) => candidate.to === phase);
        if (target?.reason) return void board.run(() => Promise.reject(new Error(target.reason)));
        if (target) moveCard(card, target);
    };

    const create = async () => {
        const title = draft.trim();
        if (!title) return setCreating(false);
        if (await board.create(title)) setDraft("");
    };

    useHotkeys({ n: () => setCreating(true) });

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-end gap-[var(--aspis-space-5)] px-[var(--aspis-gutter)] pt-[var(--aspis-space-5)] pb-[var(--aspis-space-4)]">
                <div className="min-w-[200px] flex-1">
                    <TextField label="Search" placeholder="Title, brief or #id" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                <div className="w-[260px]">
                    <Select
                        label="Repository"
                        value={repo}
                        onChange={(event) => setRepo(event.target.value)}
                        options={[{ value: allRepos, label: "All repositories" }, ...repos.map((folder) => ({ value: folder, label: folderName(folder) }))]}
                    />
                </div>
                <Button variant="primary" icon="plus" hotkey="N" onClick={() => setCreating(true)}>
                    New card
                </Button>
            </div>
            <div className="min-h-0 flex-1">
                <Board label="Kanban">
                    {phases.map((phase) => {
                        const column = visible.filter((card) => card.phase === phase);
                        return (
                            <Column
                                key={phase}
                                title={phaseLabels[phase]}
                                count={column.length}
                                drop={dropState(phase)}
                                onDragOver={(event) => {
                                    if (dropState(phase) === "allowed") event.preventDefault();
                                }}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    drop(phase);
                                }}
                                actions={
                                    phase === "triage" ? (
                                        <Button variant="quiet" onClick={() => setCreating(true)}>
                                            + New
                                        </Button>
                                    ) : undefined
                                }
                            >
                                {phase === "triage" && creating && (
                                    <li className="aspis-column__item">
                                        <TextField
                                            label="New card"
                                            autoFocus
                                            placeholder="Title, Enter to add, Esc to close"
                                            value={draft}
                                            onChange={(event) => setDraft(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") void create();
                                                if (event.key === "Escape") {
                                                    setDraft("");
                                                    setCreating(false);
                                                }
                                            }}
                                        />
                                    </li>
                                )}
                                {column.map((card) => (
                                    <Tile
                                        key={card.id}
                                        reference={`#${card.id}`}
                                        title={card.title}
                                        note={card.phase === "blocked" ? (card.blockedReason ?? undefined) : undefined}
                                        active={card.id === open}
                                        draggable={humanTargets(card).length > 0}
                                        onOpen={() => setOpen(card.id)}
                                        onDragStart={(event) => {
                                            event.dataTransfer.setData("text/plain", String(card.id));
                                            event.dataTransfer.effectAllowed = "move";
                                            setDragged(card);
                                        }}
                                        onDragEnd={() => setDragged(undefined)}
                                        meta={[
                                            card.priority > 0 && `P${card.priority}`,
                                            card.implementer.harness,
                                            card.folder && folderName(card.folder),
                                            card.phase === "scheduled" && card.scheduledAt !== null && when(card.scheduledAt),
                                            card.recurrence,
                                            card.dependsOn.length > 0 && `${card.dependsOn.length} dep`,
                                            card.files.length > 0 && `${card.files.length} file${card.files.length > 1 ? "s" : ""}`,
                                        ].filter(Boolean)}
                                        marks={
                                            card.phase === "review" ? (
                                                <>
                                                    <Mark ok={card.auditorVerdict?.ok ?? null} label="Auditor" title={card.auditorVerdict?.reason} />
                                                    <Mark ok={card.humanVerdict?.ok ?? null} label="You" title={card.humanVerdict?.reason} />
                                                </>
                                            ) : undefined
                                        }
                                    />
                                ))}
                            </Column>
                        );
                    })}
                </Board>
            </div>
            <CardPanel
                id={open}
                board={board}
                server={server}
                cards={cards}
                onClose={() => setOpen(undefined)}
                onMove={moveCard}
                onPrompt={setPrompt}
            />
            <Prompt request={prompt} onClose={() => setPrompt(undefined)} />
        </div>
    );
}
