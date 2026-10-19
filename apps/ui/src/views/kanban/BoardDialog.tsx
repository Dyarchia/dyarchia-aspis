import { Button, Dialog, Form, FormRow, IconButton, TextField } from "@dyarchia/aspis";
import { type Board, type BoardRunners, MaxRunning, type Settings, emptyRunner } from "@dyarchia/core";
import { isTauri } from "@tauri-apps/api/core";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { useEffect, useId, useState } from "react";
import { RunnerFields, RunnerHeads } from "./fields.tsx";
import type { BoardApi } from "./use-board.ts";

export type BoardRequest = { board?: Board };

const blank: BoardRunners = { implementer: emptyRunner, auditor: emptyRunner };
const cap = (text: string) => MaxRunning.catch(1).parse(Math.round(Number(text)));

/*
 * One dialog makes a board and edits one, as Desktop does: the project's name and folder, how many of its cards run
 * at once (and how many all boards run together), and the runners every new card on it starts with. Folder says
 * where the project goes, and the line under it names the folder that saving will use or create, so the result is
 * never a surprise. Deleting takes a second press and removes the board and its cards from Aspis; the folder on disk
 * is never touched.
 */
export function BoardDialog({
    request,
    api,
    cards,
    settings,
    onSettings,
    onClose,
    onSaved,
}: {
    request?: BoardRequest;
    api: BoardApi;
    cards: number;
    settings: Settings;
    onSettings: (patch: Partial<Settings>) => Promise<void>;
    onClose: () => void;
    onSaved: (board?: Board) => void;
}) {
    const board = request?.board;
    const [name, setName] = useState("");
    const [folder, setFolder] = useState("");
    const [mine, setMine] = useState("1");
    const [all, setAll] = useState("1");
    const [runners, setRunners] = useState(blank);
    const [confirm, setConfirm] = useState(false);
    const [target, setTarget] = useState<{ folder: string; exists: boolean }>();
    const hintId = useId();

    useEffect(() => {
        setName(board?.name ?? "");
        setFolder(board?.folder ?? "");
        setMine(String(board?.maxRunning ?? 1));
        setAll(String(settings.maxRunning));
        setRunners(board?.runners ?? blank);
        setConfirm(false);
    }, [request, board]);

    const moved = !board || folder.trim() !== board.folder;

    useEffect(() => {
        setTarget(undefined);
        if (!request || !moved || !name.trim() || !folder.trim()) return;
        let stale = false;
        const timer = setTimeout(() => void api.projectPath(name, folder).then((next) => !stale && setTarget(next)), 200);
        return () => {
            stale = true;
            clearTimeout(timer);
        };
    }, [request, moved, name, folder]);

    const ready = name.trim() && folder.trim();
    const across = cap(all) !== settings.maxRunning;
    const changed = !board || name.trim() !== board.name || moved || cap(mine) !== board.maxRunning || JSON.stringify(runners) !== JSON.stringify(board.runners) || across;
    const save = async () => {
        if (!ready || !changed) return;
        if (across) await onSettings({ maxRunning: cap(all) });
        const draft = { name: name.trim(), maxRunning: cap(mine), runners };
        const saved = board ? await api.editBoard(board.id, { ...draft, ...(moved ? { folder: folder.trim() } : {}) }) : await api.createBoard({ ...draft, folder: folder.trim() });
        if (saved) onSaved(saved);
    };
    const hint = target && (target.folder !== folder.trim() || !target.exists) ? `${target.exists ? "Uses" : "Creates"} ${target.folder}` : undefined;
    const browse = async () => {
        const picked = await pickFolder({ directory: true, defaultPath: folder.trim() || undefined, title: "Project folder" });
        if (typeof picked === "string") setFolder(picked);
    };

    return (
        <Dialog
            open={Boolean(request)}
            onClose={onClose}
            placement="center"
            title={board ? "Board settings" : "New board"}
            footer={
                <>
                    <Button variant="primary" disabled={!ready || !changed} onClick={() => void save()}>
                        {board ? "Save" : "Create"}
                    </Button>
                    {board && (
                        <div className="ml-auto flex items-center gap-[var(--aspis-space-1)]">
                            {confirm ? (
                                <>
                                    <Button variant="quiet" autoFocus onClick={() => setConfirm(false)}>
                                        Keep it
                                    </Button>
                                    <Button variant="secondary" onClick={() => void api.removeBoard(board.id).then((done) => done !== undefined && onSaved())}>
                                        {cards > 0 ? `Delete it and its ${cards} card${cards > 1 ? "s" : ""}` : "Delete for good"}
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <IconButton
                                        icon="archive"
                                        label={board.archived ? "Restore board" : "Archive board"}
                                        onClick={() => void api.editBoard(board.id, { archived: !board.archived }).then((saved) => saved && onSaved(saved))}
                                    />
                                    <IconButton icon="trash" label="Delete board" onClick={() => setConfirm(true)} />
                                </>
                            )}
                        </div>
                    )}
                </>
            }
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                }}
            >
                <Form>
                    <TextField label="Name" autoFocus required value={name} onChange={(event) => setName(event.target.value)} />
                    <FormRow label="Folder">
                        <div className="flex items-center gap-[var(--aspis-space-2)]">
                            <TextField
                                label="Folder"
                                hideLabel
                                className="flex-1"
                                required
                                placeholder={"C:\\repos"}
                                aria-describedby={hint ? hintId : undefined}
                                value={folder}
                                onChange={(event) => setFolder(event.target.value)}
                            />
                            {isTauri() && <IconButton icon="folder" label="Browse" onClick={() => void browse()} />}
                        </div>
                        {hint && (
                            <p id={hintId} className="aspis-field__hint m-0">
                                {hint}
                            </p>
                        )}
                    </FormRow>
                    <FormRow label="Max running">
                        <div className="flex items-center gap-[var(--aspis-space-3)]">
                            <TextField label="Max running on this board" hideLabel className="flex-none" type="number" min={1} max={10} value={mine} onChange={(event) => setMine(event.target.value)} />
                            <span className="aspis-field__hint mr-[var(--aspis-space-3)] whitespace-nowrap">This board</span>
                            <TextField label="Max running on all boards" hideLabel className="flex-none" type="number" min={1} max={10} value={all} onChange={(event) => setAll(event.target.value)} />
                            <span className="aspis-field__hint whitespace-nowrap">All boards</span>
                        </div>
                    </FormRow>
                    <FormRow label="Runners">
                        <RunnerHeads />
                    </FormRow>
                    <FormRow label="Implementer">
                        <RunnerFields label="Implementer" runner={runners.implementer} disabled={false} onCommit={(implementer) => setRunners({ ...runners, implementer })} />
                    </FormRow>
                    <FormRow label="Auditor">
                        <RunnerFields label="Auditor" runner={runners.auditor} disabled={false} onCommit={(auditor) => setRunners({ ...runners, auditor })} />
                    </FormRow>
                </Form>
                <button type="submit" hidden />
            </form>
        </Dialog>
    );
}
