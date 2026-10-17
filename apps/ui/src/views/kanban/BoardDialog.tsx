import { Button, Dialog, TextField } from "@dyarchia/aspis";
import type { Board } from "@dyarchia/core";
import { isTauri } from "@tauri-apps/api/core";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import type { BoardApi } from "./use-board.ts";

export type BoardRequest = { board?: Board };

/*
 * One dialog makes a board and edits one. A board is a project: its name and the folder its cards run in. Deleting
 * takes a second press and removes the board and its cards from Aspis; the folder on disk is never touched.
 */
export function BoardDialog({ request, api, cards, onClose, onSaved }: { request?: BoardRequest; api: BoardApi; cards: number; onClose: () => void; onSaved: (board?: Board) => void }) {
    const board = request?.board;
    const [name, setName] = useState("");
    const [folder, setFolder] = useState("");
    const [confirm, setConfirm] = useState(false);

    useEffect(() => {
        setName(board?.name ?? "");
        setFolder(board?.folder ?? "");
        setConfirm(false);
    }, [request, board]);

    const ready = name.trim() && folder.trim();
    const changed = !board || name.trim() !== board.name || folder.trim() !== board.folder;
    const save = async () => {
        if (!ready || !changed) return;
        const draft = { name: name.trim(), folder: folder.trim() };
        const saved = board ? await api.editBoard(board.id, draft) : await api.createBoard(draft);
        if (saved) onSaved(saved);
    };
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
                <div className="flex items-end gap-[var(--aspis-space-3)]">
                    <TextField label="Folder" className="flex-1" required placeholder={"C:\\repos\\name"} value={folder} onChange={(event) => setFolder(event.target.value)} />
                    {isTauri() && (
                        <Button variant="secondary" onClick={() => void browse()}>
                            Browse
                        </Button>
                    )}
                </div>
                <button type="submit" hidden />
            </form>
        </Dialog>
    );
}
