import { Button, Chip, CodeBlock, Dialog, GroupHeader, Mark, Select, TextArea, TextField, Thread, type ThreadEntry, type Tone } from "@dyarchia/aspis";
import {
    type Actor,
    type Card,
    type CardDetail,
    type CardEdit,
    type CardEvent,
    Permission,
    type Phase,
    Recurrence,
    type Runner,
    type Target,
    canEdit,
    efforts,
    harnesses,
    phaseLabels,
    pickupCommands,
    resumeCommands,
} from "@dyarchia/core";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ServerState } from "../../use-server.ts";
import type { PromptRequest } from "./Prompt.tsx";
import { RunHistory } from "./Runs.tsx";
import type { BoardApi } from "./use-board.ts";

const actorLabels: Record<Actor, string> = { human: "You", agent: "Agent", system: "System", auditor: "Auditor" };
const phaseTone: Partial<Record<Phase, Tone>> = { running: "info", blocked: "warn", review: "info", done: "ok", archived: "idle" };
const time = (at: number) => new Date(at).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const localInput = (at: number | null) => {
    if (at === null) return "";
    const date = new Date(at);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const bytes = (size: number) => (size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`);

function describe(event: CardEvent): string {
    if (event.kind === "moved") return `${phaseLabels[event.from!]} → ${phaseLabels[event.to!]}${event.text ? `\n${event.text}` : ""}`;
    if (event.kind === "created") return event.text ?? `Created in ${phaseLabels[event.to ?? "triage"]}`;
    if (event.kind === "edited") return `Edited ${event.text}`;
    return event.text ?? "";
}

function LiveField({
    label,
    value,
    onCommit,
    disabled,
    type = "text",
    multiline,
    placeholder,
    hideLabel,
}: {
    label: string;
    value: string;
    onCommit: (value: string) => void;
    disabled: boolean;
    type?: string;
    multiline?: boolean;
    placeholder?: string;
    hideLabel?: boolean;
}) {
    const [local, setLocal] = useState(value);
    const editing = useRef(false);
    useEffect(() => {
        if (!editing.current) setLocal(value);
    }, [value]);
    const shared = {
        label,
        hideLabel,
        value: local,
        disabled,
        placeholder,
        onFocus: () => (editing.current = true),
        onBlur: () => {
            editing.current = false;
            if (local !== value) onCommit(local);
        },
    };
    return multiline ? (
        <TextArea {...shared} onChange={(event) => setLocal(event.target.value)} />
    ) : (
        <TextField {...shared} type={type} onChange={(event) => setLocal(event.target.value)} />
    );
}

function RunnerFields({ label, runner, disabled, onCommit }: { label: string; runner: Runner; disabled: boolean; onCommit: (runner: Runner) => void }) {
    return (
        <div className="grid grid-cols-3 gap-[var(--aspis-space-4)]">
            <Select
                label={`${label} harness`}
                value={runner.harness ?? ""}
                disabled={disabled}
                onChange={(event) => onCommit({ ...runner, harness: event.target.value || null })}
                options={[{ value: "", label: "Not set" }, ...harnesses.map((harness) => ({ value: harness, label: harness }))]}
            />
            <LiveField label={`${label} model`} value={runner.model ?? ""} disabled={disabled} onCommit={(model) => onCommit({ ...runner, model: model.trim() || null })} />
            <Select
                label={`${label} effort`}
                value={runner.effort ?? ""}
                disabled={disabled}
                onChange={(event) => onCommit({ ...runner, effort: event.target.value || null })}
                options={[{ value: "", label: "Default" }, ...efforts.map((effort) => ({ value: effort, label: effort }))]}
            />
        </div>
    );
}

function Block({ label, actions, children }: { label?: string; actions?: ReactNode; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-[var(--aspis-space-4)]">
            {label && <GroupHeader label={label} actions={actions} />}
            {children}
        </div>
    );
}

export function CardPanel({
    id,
    board,
    server,
    cards,
    onClose,
    onMove,
    onPrompt,
}: {
    id?: number;
    board: BoardApi;
    server: ServerState;
    cards: readonly Card[];
    onClose: () => void;
    onMove: (card: Card, target: Target) => void;
    onPrompt: (request: PromptRequest) => void;
}) {
    const [detail, setDetail] = useState<CardDetail>();
    const [note, setNote] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(false);
    const upload = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setConfirmDelete(false);
        if (id === undefined) return setDetail(undefined);
        let stale = false;
        void board.run(() => board.detail(id)).then((next) => !stale && next && setDetail(next));
        return () => {
            stale = true;
        };
    }, [id, server.changes]);

    const card = detail?.card.id === id ? detail?.card : undefined;
    if (!card || !detail)
        return (
            <Dialog open={id !== undefined} onClose={onClose} title="Loading">
                {null}
            </Dialog>
        );

    const editable = canEdit(card, "human");
    const edit = (change: CardEdit) => void board.edit(card.id, change);
    const ask = (title: string, label: string, action: string, submit: (text: string) => void) => onPrompt({ title, label, action, submit });
    const others = cards.filter((other) => other.id !== card.id && !card.dependsOn.includes(other.id));
    const delivered = (event: CardEvent) => card.route === "ready" && event.actor === "human" && Boolean(event.text) && event.id <= detail.delivered;
    const entries: ThreadEntry[] = detail.events.map((event) => ({
        id: event.id,
        who: actorLabels[event.actor],
        when: `${time(event.at)}${delivered(event) ? " · delivered" : ""}`,
        kind: event.kind,
        text: describe(event),
    }));
    const harness = card.implementer.harness ?? "";
    const pickup = pickupCommands[harness];
    const resume = card.sessionId ? resumeCommands[harness]?.(card.sessionId) : undefined;

    const simulate: { label: string; run: () => void }[] = [];
    if (card.phase === "ready") simulate.push({ label: "Agent picks it up", run: () => void board.act(card.id, "agent", { to: "running", sessionId: `dev-${Date.now()}` }) });
    if (card.phase === "scheduled") {
        simulate.push({ label: "Dispatch now", run: () => void board.dispatch() });
        simulate.push({ label: "System starts it", run: () => void board.act(card.id, "system", { to: "running" }) });
    }
    if (card.phase === "running") {
        simulate.push({ label: "Agent blocks", run: () => ask(`#${card.id} blocked by the agent`, "Reason", "Block", (text) => void board.act(card.id, "agent", { to: "blocked", note: text })) });
        simulate.push({ label: "System blocks", run: () => ask(`#${card.id} blocked by the system`, "Technical reason", "Block", (text) => void board.act(card.id, "system", { to: "blocked", note: text })) });
        if (card.route === "ready") simulate.push({ label: "Agent delivers", run: () => ask(`#${card.id} to Review`, "Summary of the work", "Deliver", (text) => void board.act(card.id, "agent", { to: "review", note: text })) });
        if (card.route === "scheduled") simulate.push({ label: "System finishes", run: () => void board.act(card.id, "system", { to: "archived" }) });
    }
    if (card.phase === "review" && !card.auditorVerdict) {
        simulate.push({ label: "Auditor ✓", run: () => ask(`#${card.id} audit`, "Why it passes", "Approve", (text) => void board.audit(card.id, true, text)) });
        simulate.push({ label: "Auditor ✗", run: () => ask(`#${card.id} audit`, "Why it fails", "Reject", (text) => void board.audit(card.id, false, text)) });
    }

    return (
        <Dialog
            open
            onClose={onClose}
            label={`#${card.id} ${card.title}`}
            title={
                <div className="flex min-w-0 flex-col gap-[var(--aspis-space-2)]">
                    <div className="flex items-center gap-[var(--aspis-space-3)]">
                        <span className="aspis-tile__ref">#{card.id}</span>
                        <Chip tone={phaseTone[card.phase]}>{phaseLabels[card.phase]}</Chip>
                    </div>
                    <LiveField label="Title" hideLabel value={card.title} disabled={!editable} onCommit={(title) => title.trim() && edit({ title })} />
                </div>
            }
            footer={
                card.phase === "triage" ? (
                    confirmDelete ? (
                        <>
                            <Button variant="quiet" autoFocus onClick={() => setConfirmDelete(false)}>
                                Keep it
                            </Button>
                            <Button variant="primary" onClick={() => void board.remove(card.id).then(onClose)}>
                                Delete for good
                            </Button>
                        </>
                    ) : (
                        <Button variant="quiet" onClick={() => setConfirmDelete(true)}>
                            Delete card
                        </Button>
                    )
                ) : undefined
            }
        >
            <Block label="Move">
                <div className="flex flex-wrap gap-[var(--aspis-space-3)]">
                    {detail.targets.map((target) => (
                        <Button key={target.to} variant="secondary" disabled={Boolean(target.reason)} onClick={() => onMove(card, target)}>
                            {phaseLabels[target.to]}
                        </Button>
                    ))}
                    {detail.targets.length === 0 && card.phase !== "archived" && <span className="aspis-field__hint">Agent owns this card</span>}
                </div>
                {detail.targets.some((target) => target.reason) && (
                    <ul className="m-0 flex list-none flex-col gap-[var(--aspis-space-1)] p-0">
                        {detail.targets
                            .filter((target) => target.reason)
                            .map((target) => (
                                <li key={target.to} className="aspis-field__hint">
                                    {phaseLabels[target.to]}: {target.reason}
                                </li>
                            ))}
                    </ul>
                )}
                {card.blockedReason && <Chip tone="warn">{card.blockedReason}</Chip>}
                {card.held && card.phase === "scheduled" && <span className="aspis-field__hint">Waiting: {card.held}</span>}
            </Block>

            {card.phase === "review" && (
                <Block label="Checks">
                    <div className="flex flex-col gap-[var(--aspis-space-3)]">
                        <div className="flex flex-wrap items-center gap-[var(--aspis-space-3)]">
                            <Mark ok={card.auditorVerdict?.ok ?? null} label="Auditor" />
                            <span className="aspis-field__hint">{card.auditorVerdict?.reason ?? card.held ?? "Auditing…"}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-[var(--aspis-space-3)]">
                            <Mark ok={card.humanVerdict?.ok ?? null} label="You" />
                            {card.humanVerdict?.reason && <span className="aspis-field__hint">{card.humanVerdict.reason}</span>}
                        </div>
                        {!card.auditorVerdict && card.held && (
                            <div className="flex gap-[var(--aspis-space-3)]">
                                <Button variant="primary" icon="history" onClick={() => void board.retryAudit(card.id)}>
                                    Retry audit
                                </Button>
                                <Button variant="secondary" icon="close" onClick={() => ask(`Check #${card.id}`, "Why you reject it", "Reject", (text) => void board.verdict(card.id, false, text))}>
                                    Reject
                                </Button>
                            </div>
                        )}
                        {card.auditorVerdict && (
                            <div className="flex gap-[var(--aspis-space-3)]">
                                <Button variant="primary" icon="check" onClick={() => ask(`Check #${card.id}`, "Why you approve it", "Approve", (text) => void board.verdict(card.id, true, text))}>
                                    Approve
                                </Button>
                                <Button variant="secondary" icon="close" onClick={() => ask(`Check #${card.id}`, "Why you reject it", "Reject", (text) => void board.verdict(card.id, false, text))}>
                                    Reject
                                </Button>
                            </div>
                        )}
                    </div>
                </Block>
            )}

            {card.phase === "ready" && (
                <Block label="Pick it up">
                    {pickup ? (
                        <CodeBlock title={card.folder ?? "folder"} lang={harness} lines={[{ text: pickup }]} />
                    ) : (
                        <span className="aspis-field__hint">{harness || "This harness"} has no Aspis hooks. Wire claude-code or kimi-code in Settings.</span>
                    )}
                    {card.auditor.harness !== "claude-code" && (
                        <span className="aspis-field__hint">The auditor ({card.auditor.harness ?? "not set"}) cannot run headless: retry or reject in Review.</span>
                    )}
                </Block>
            )}

            {card.sessionId && (
                <Block>
                    {card.phase === "running" && card.route === "scheduled" && <span className="aspis-field__hint">Resume it once this run ends.</span>}
                    {resume ? (
                        <CodeBlock title={`Session ${card.sessionId}`} lang={harness} lines={[{ text: `cd "${card.folder}"` }, { text: resume }]} />
                    ) : (
                        <span className="aspis-field__hint">Session {card.sessionId}</span>
                    )}
                </Block>
            )}

            {(card.route || card.phase === "scheduled") && (
                <RunHistory
                    card={card}
                    board={board}
                    changes={server.changes}
                    label={card.route === "ready" ? "Activity" : "Runs"}
                    actions={
                        card.phase === "running" && card.route === "scheduled" ? (
                            <Button variant="secondary" icon="close" onClick={() => void board.stop(card.id)}>
                                Stop
                            </Button>
                        ) : undefined
                    }
                />
            )}

            <Block>
                <LiveField label="Brief" multiline value={card.brief} disabled={!editable} onCommit={(brief) => edit({ brief })} />
                <div className="grid grid-cols-2 gap-[var(--aspis-space-4)]">
                    <LiveField label="Folder" value={card.folder ?? ""} disabled={!editable} placeholder={"C:\\repos\\name"} onCommit={(folder) => edit({ folder: folder.trim() || null })} />
                    <LiveField label="Base branch" value={card.baseBranch ?? ""} disabled={!editable} placeholder="develop" onCommit={(branch) => edit({ baseBranch: branch.trim() || null })} />
                    <LiveField label="Priority" type="number" value={String(card.priority)} disabled={!editable} onCommit={(priority) => edit({ priority: Number(priority) || 0 })} />
                    <Select
                        label="Permission"
                        value={card.permission}
                        disabled={!editable}
                        onChange={(event) => edit({ permission: Permission.parse(event.target.value) })}
                        options={Permission.options.map((option) => ({ value: option, label: option }))}
                    />
                    <LiveField
                        label="Time limit (min)"
                        type="number"
                        value={card.timeLimitMin === null ? "" : String(card.timeLimitMin)}
                        disabled={!editable}
                        placeholder="None"
                        onCommit={(limit) => edit({ timeLimitMin: Number(limit) > 0 ? Math.round(Number(limit)) : null })}
                    />
                    <LiveField label="Retries on failure" type="number" value={String(card.retries)} disabled={!editable} onCommit={(retries) => edit({ retries: Math.max(0, Math.round(Number(retries) || 0)) })} />
                </div>
            </Block>

            <Block label="Runners">
                <RunnerFields label="Implementer" runner={card.implementer} disabled={!editable} onCommit={(implementer) => edit({ implementer })} />
                <RunnerFields label="Auditor" runner={card.auditor} disabled={!editable} onCommit={(auditor) => edit({ auditor })} />
            </Block>

            <Block label="Schedule">
                <div className="grid grid-cols-2 gap-[var(--aspis-space-4)]">
                    <LiveField
                        label="Date and time"
                        type="datetime-local"
                        value={localInput(card.scheduledAt)}
                        disabled={!editable}
                        onCommit={(at) => edit({ scheduledAt: at ? new Date(at).getTime() : null })}
                    />
                    <Select
                        label="Repeats"
                        value={card.recurrence ?? ""}
                        disabled={!editable}
                        onChange={(event) => edit({ recurrence: event.target.value ? Recurrence.parse(event.target.value) : null })}
                        options={[{ value: "", label: "Once" }, ...Recurrence.options.map((option) => ({ value: option, label: option }))]}
                    />
                </div>
            </Block>

            <Block label="Depends on">
                <div className="flex flex-wrap items-center gap-[var(--aspis-space-3)]">
                    {card.dependsOn.map((dependency) => {
                        const other = cards.find((candidate) => candidate.id === dependency);
                        return (
                            <span key={dependency} className="inline-flex items-center gap-[var(--aspis-space-2)]">
                                <Mark ok={other?.phase === "done" || other?.phase === "archived" ? true : null} label={`#${dependency} ${other?.title ?? ""}`} />
                                {editable && (
                                    <Button variant="quiet" aria-label={`Remove dependency ${dependency}`} onClick={() => edit({ dependsOn: card.dependsOn.filter((value) => value !== dependency) })}>
                                        Remove
                                    </Button>
                                )}
                            </span>
                        );
                    })}
                </div>
                {editable && others.length > 0 && (
                    <Select
                        label="Add a dependency"
                        value=""
                        onChange={(event) => event.target.value && edit({ dependsOn: [...card.dependsOn, Number(event.target.value)] })}
                        options={[{ value: "", label: "Choose a card" }, ...others.map((other) => ({ value: String(other.id), label: `#${other.id} ${other.title}` }))]}
                    />
                )}
            </Block>

            <Block
                label="Files"
                actions={
                    editable ? (
                        <Button variant="quiet" onClick={() => upload.current?.click()}>
                            Attach
                        </Button>
                    ) : undefined
                }
            >
                <input
                    ref={upload}
                    type="file"
                    hidden
                    multiple
                    onChange={async (event) => {
                        for (const file of Array.from(event.target.files ?? [])) await board.upload(card.id, file);
                        event.target.value = "";
                    }}
                />
                {card.files.map((file) => (
                    <div key={file.id} className="flex items-center gap-[var(--aspis-space-3)]">
                        <a className="aspis-field__hint" href={board.fileUrl(card.id, file.id)} download={file.name}>
                            {file.name}
                        </a>
                        <span className="aspis-field__hint">{bytes(file.bytes)}</span>
                        {editable && (
                            <Button variant="quiet" aria-label={`Remove ${file.name}`} onClick={() => void board.removeFile(card.id, file.id)}>
                                Remove
                            </Button>
                        )}
                    </div>
                ))}
            </Block>

            {server.health?.dev && simulate.length > 0 && (
                <Block label="Simulate (dev only)">
                    <div className="flex flex-wrap gap-[var(--aspis-space-3)]">
                        {simulate.map((action) => (
                            <Button key={action.label} variant="secondary" onClick={action.run}>
                                {action.label}
                            </Button>
                        ))}
                    </div>
                </Block>
            )}

            <Block label="Thread">
                <Thread
                    entries={entries}
                    composer={
                        <>
                            <div className="flex-1">
                                <TextArea label="Note" hideLabel rows={2} value={note} placeholder="Note for the agent" onChange={(event) => setNote(event.target.value)} />
                            </div>
                            <Button
                                variant="secondary"
                                disabled={!note.trim()}
                                onClick={async () => {
                                    if (await board.note(card.id, note)) setNote("");
                                }}
                            >
                                Add note
                            </Button>
                        </>
                    }
                />
            </Block>
        </Dialog>
    );
}
