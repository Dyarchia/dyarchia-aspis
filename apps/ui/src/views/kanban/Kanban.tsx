import { Board, Button, Column, type DropState, EmptyState, IconButton, Mark, Page, Select, Stage, TextField, Tile, useHotkeys } from "@dyarchia/aspis";
import { type Board as Project, type Card, type Phase, type Target, phaseLabels, phases, targets } from "@dyarchia/core";
import { useMemo, useRef, useState } from "react";
import { readHint, writeHint } from "../../hints.ts";
import type { ServerState } from "../../use-server.ts";
import { type BoardRequest, BoardDialog } from "./BoardDialog.tsx";
import { CardPanel } from "./CardPanel.tsx";
import { Prompt, type PromptRequest } from "./Prompt.tsx";
import { useBoard } from "./use-board.ts";

const foldedByDefault: Phase[] = ["done", "archived"];
const readFolded = () => {
    const hint = readHint("kanban.folded");
    return new Set<Phase>(hint === undefined ? foldedByDefault : (hint.split(",").filter((phase) => phases.includes(phase as Phase)) as Phase[]));
};
const ago = (at: number) => {
    const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 48 * 60) return `${Math.round(minutes / 60)}h ago`;
    return `${Math.round(minutes / 1440)}d ago`;
};
const when = (at: number) => new Date(at).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/*
 * One board per project. Three quiet controls at the end of the toolbar, as in dyarchia-desktop: the board's name
 * switches boards, + makes a new one and the sliders edit the open one. The choice is remembered; with none, or one
 * that no longer exists, the first open board opens, and with no board at all the view asks for the first.
 *
 * Cards are born in Triage, from the + on its column. As in Desktop, Enter, the Add key and leaving the field all
 * mean a typed title is a card; the draft is closed before the card is asked for, so the blur that follows finds
 * nothing left to add, and a refusal puts the title back. Escape closes the draft and keeps what was typed. Like
 * Desktop, neither moves focus to the +, which would leave it lit with its tooltip after every card.
 */
export function Kanban({ server }: { server: ServerState }) {
    const board = useBoard(server);
    const [chosen, setChosen] = useState(readHint("kanban.board") ?? "");
    const [editing, setEditing] = useState<BoardRequest>();
    const [query, setQuery] = useState("");
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState("");
    const drafting = useRef(false);
    const [open, setOpen] = useState<number>();
    const [dragged, setDragged] = useState<Card>();
    const [prompt, setPrompt] = useState<PromptRequest>();
    const [folded, setFolded] = useState(readFolded);
    const [full, setFull] = useState(readHint("kanban.inspector") === "full");
    const widen = (next: boolean) => {
        setFull(next);
        writeHint("kanban.inspector", next ? "full" : "half");
    };

    const fold = (phase: Phase) =>
        setFolded((current) => {
            const next = new Set(current);
            if (!next.delete(phase)) next.add(phase);
            writeHint("kanban.folded", [...next].join(","));
            return next;
        });

    const cards = board.cards ?? [];
    const boards = board.boards ?? [];
    const current = boards.find((candidate) => String(candidate.id) === chosen) ?? boards.find((candidate) => !candidate.archived) ?? boards[0];
    const phaseOf = useMemo(() => new Map(cards.map((card) => [card.id, card.phase])), [cards]);
    const needle = query.trim().toLowerCase();
    const visible = cards.filter((card) => card.board === current?.id && (!needle || `#${card.id} ${card.title} ${card.brief}`.toLowerCase().includes(needle)));
    const choose = (value: string) => {
        setChosen(value);
        setOpen(undefined);
        writeHint("kanban.board", value);
    };
    const saved = (next?: Project) => {
        setEditing(undefined);
        choose(next && !next.archived ? String(next.id) : "");
    };
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

    const writable = Boolean(current && !current.archived);
    const startDraft = () => {
        drafting.current = true;
        setCreating(true);
    };
    const park = () => {
        drafting.current = false;
        setCreating(false);
    };
    const commit = async () => {
        if (!drafting.current) return;
        drafting.current = false;
        const title = draft.trim();
        setDraft("");
        setCreating(false);
        if (!title || !current) return;
        if (await board.create(title, current.id)) return;
        setDraft(title);
        startDraft();
    };

    useHotkeys({ n: () => writable && startDraft() });

    const dialog = (
        <BoardDialog
            request={editing}
            api={board}
            cards={cards.filter((card) => card.board === editing?.board?.id).length}
            settings={server.settings}
            onSettings={server.saveSettings}
            onClose={() => setEditing(undefined)}
            onSaved={saved}
        />
    );

    if (board.boards && boards.length === 0) {
        return (
            <Page title="Kanban">
                <EmptyState
                    title="No boards yet"
                    action={
                        <Button variant="primary" icon="plus" onClick={() => setEditing({})}>
                            New board
                        </Button>
                    }
                />
                {dialog}
            </Page>
        );
    }

    return (
        <Page
            title="Kanban"
            tools={
                current && (
                    <div className="min-w-[200px] max-w-[560px] flex-1">
                        <TextField label="Search cards" hideLabel type="search" placeholder="Search title, brief or #id" value={query} onChange={(event) => setQuery(event.target.value)} />
                    </div>
                )
            }
            actions={
                <>
                    <Select
                        label="Board"
                        hideLabel
                        quiet
                        value={current ? String(current.id) : ""}
                        onChange={(event) => choose(event.target.value)}
                        options={[
                            ...boards.filter((entry) => !entry.archived).map((entry) => ({ value: String(entry.id), label: entry.name })),
                            ...boards.filter((entry) => entry.archived).map((entry) => ({ value: String(entry.id), label: entry.name, group: "Archived" })),
                        ]}
                    />
                    <IconButton icon="plus" label="New board" onClick={() => setEditing({})} />
                    {current && <IconButton icon="sliders" label="Board settings" onClick={() => setEditing({ board: current })} />}
                </>
            }
        >
            <div className="flex min-h-0 flex-1 flex-col pt-[var(--aspis-space-3)]">
                <Stage>
                    <Board label="Kanban">
                        {phases.map((phase) => {
                            const column = visible.filter((card) => card.phase === phase);
                            return (
                                <Column
                                    key={phase}
                                    title={phaseLabels[phase]}
                                    count={column.length}
                                    drop={dropState(phase)}
                                    folded={folded.has(phase)}
                                    onFold={() => fold(phase)}
                                    actions={phase === "triage" && writable && <IconButton icon="plus" label="New card" hotkey="N" onClick={startDraft} />}
                                    onDragOver={(event) => {
                                        if (dropState(phase) === "allowed") event.preventDefault();
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        drop(phase);
                                    }}
                                >
                                    {phase === "triage" && creating && (
                                        <li className="aspis-column__item flex items-center gap-[var(--aspis-space-1)]">
                                            <TextField
                                                label="New card title"
                                                hideLabel
                                                autoFocus
                                                className="flex-1"
                                                placeholder="Title"
                                                value={draft}
                                                onChange={(event) => setDraft(event.target.value)}
                                                onBlur={() => void commit()}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter") {
                                                        event.preventDefault();
                                                        void commit();
                                                    }
                                                    if (event.key === "Escape") park();
                                                }}
                                            />
                                            <IconButton icon="check" label="Add" onMouseDown={(event) => event.preventDefault()} onClick={() => void commit()} />
                                        </li>
                                    )}
                                    {column.map((card) => (
                                        <Tile
                                            key={card.id}
                                            reference={`#${card.id}`}
                                            title={card.title}
                                            note={card.phase === "blocked" ? (card.blockedReason ?? undefined) : card.phase === "scheduled" && card.held ? `Waiting: ${card.held}` : undefined}
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
                                                card.phase === "scheduled" && card.scheduledAt !== null && when(card.scheduledAt),
                                                card.recurrence,
                                                card.dependsOn.length > 0 && `${card.dependsOn.length} dep`,
                                                card.files.length > 0 && `${card.files.length} file${card.files.length > 1 ? "s" : ""}`,
                                                <time dateTime={new Date(card.updatedAt).toISOString()}>{ago(card.updatedAt)}</time>,
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
                    {open !== undefined && (
                        <CardPanel
                            id={open}
                            board={board}
                            server={server}
                            cards={cards}
                            onClose={() => setOpen(undefined)}
                            onMove={moveCard}
                            onPrompt={setPrompt}
                            full={full}
                            onFull={widen}
                        />
                    )}
                </Stage>
            </div>
            <Prompt request={prompt} onClose={() => setPrompt(undefined)} />
            {dialog}
        </Page>
    );
}
