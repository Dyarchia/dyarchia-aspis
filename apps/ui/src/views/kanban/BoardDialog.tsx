import { Button, Dialog, TextField } from "@dyarchia/aspis";
import type { Board } from "@dyarchia/core";
import { isTauri } from "@tauri-apps/api/core";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { useEffect, useId, useState } from "react";
import type { BoardApi } from "./use-board.ts";

export type BoardRequest = { board?: Board };

/*
 * One dialog makes a board and edits one. A board is a project: its name and the folder its cards run in. Folder
 * says where the project goes, and the line under it names the folder that saving will use or create, so the
 * result is never a surprise. Deleting takes a second press and removes the board and its cards from Aspis; the
 * folder on disk is never touched.
 */
export function BoardDialog({ request, api, cards, onClose, onSaved }: { request?: BoardRequest; api: BoardApi; cards: number; onClose: () => void; onSaved: (board?: Board) => void }) {
    const board = request?.board;
    const [name, setName] = useState("");
    const [folder, setFolder] = useState("");
    const [confirm, setConfirm] = useState(false);
    const [target, setTarget] = useState<{ folder: string; exists: boolean }>();
    const hintId = useId();

    useEffect(() => {
        setName(board?.name ?? "");
        setFolder(board?.folder ?? "");
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
    const changed = !board || name.trim() !== board.name || moved;
    const save = async () => {
        if (!ready || !changed) return;
        const draft = { name: name.trim(), ...(moved ? { folder: folder.trim() } : {}) };
        const saved = board ? await api.editBoard(board.id, draft) : await api.createBoard({ name: draft.name, folder: folder.trim() });
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
            title={board ? board.name : "New board"}
            footer={
                <>
                    {board &&
                        (confirm ? (
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
                                <Button variant="quiet" onClick={() => setConfirm(true)}>
                                    Delete
                                </Button>
                                <Button variant="quiet" onClick={() => void api.editBoard(board.id, { archived: !board.archived }).then((saved) => saved && onSaved(saved))}>
                                    {board.archived ? "Restore" : "Archive"}
                                </Button>
                            </>
                        ))}
                    <Button variant="primary" disabled={!ready || !changed} onClick={() => void save()}>
                        {board ? "Save" : "Create"}
                    </Button>
                </>
            }
        >
            <form
                className="flex flex-col gap-[var(--aspis-space-4)]"
                onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                }}
            >
                <TextField label="Name" autoFocus required value={name} onChange={(event) => setName(event.target.value)} />
                <div className="flex flex-col gap-[var(--aspis-space-2)]">
                    <div className="flex items-end gap-[var(--aspis-space-3)]">
                        <TextField
                            label="Folder"
                            className="flex-1"
                            required
                            placeholder={"C:\\repos"}
                            aria-describedby={hint ? hintId : undefined}
                            value={folder}
                            onChange={(event) => setFolder(event.target.value)}
                        />
                        {isTauri() && (
                            <Button variant="secondary" onClick={() => void browse()}>
                                Browse
                            </Button>
                        )}
                    </div>
                    {hint && (
                        <p id={hintId} className="aspis-field__hint">
                            {hint}
                        </p>
                    )}
                </div>
                <button type="submit" hidden />
            </form>
        </Dialog>
    );
}
