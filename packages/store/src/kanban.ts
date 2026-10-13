import {
    type Actor,
    type Card,
    type CardEdit,
    type CardEvent,
    type MoveRequest,
    type Phase,
    Runner,
    type Target,
    Verdict,
    canEdit,
    emptyRunner,
    move,
    targets,
    verdict,
} from "@dyarchia/core";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Store } from "./index.ts";

export class KanbanError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 404 | 409,
    ) {
        super(message);
    }
}

interface CardRow {
    id: number;
    title: string;
    brief: string;
    phase: Card["phase"];
    route: Card["route"];
    priority: number;
    folder: string | null;
    base_branch: string | null;
    permission: Card["permission"];
    implementer: string;
    auditor: string;
    scheduled_at: number | null;
    recurrence: Card["recurrence"];
    time_limit_min: number | null;
    retries: number;
    session_id: string | null;
    auditor_verdict: string | null;
    human_verdict: string | null;
    blocked_reason: string | null;
    held: string | null;
    created_at: number;
    updated_at: number;
}

const columns: Record<string, string> = {
    title: "title",
    brief: "brief",
    phase: "phase",
    route: "route",
    priority: "priority",
    folder: "folder",
    baseBranch: "base_branch",
    permission: "permission",
    implementer: "implementer",
    auditor: "auditor",
    scheduledAt: "scheduled_at",
    recurrence: "recurrence",
    timeLimitMin: "time_limit_min",
    retries: "retries",
    sessionId: "session_id",
    auditorVerdict: "auditor_verdict",
    humanVerdict: "human_verdict",
    blockedReason: "blocked_reason",
    held: "held",
};

const json = new Set(["implementer", "auditor", "auditorVerdict", "humanVerdict"]);
const verdictOf = (value: string | null) => (value === null ? null : Verdict.parse(JSON.parse(value)));
const modelPhases: readonly Phase[] = ["ready", "running", "blocked", "review"];
const inherited = ["folder", "baseBranch", "permission", "retries", "implementer", "auditor"] as const;

export class Kanban {
    readonly filesDir: string;

    constructor(private readonly store: Store) {
        this.filesDir = join(dirname(store.path), "files");
    }

    private get db() {
        return this.store.db;
    }

    list(): Card[] {
        const rows = this.db.query<CardRow, []>("SELECT * FROM cards ORDER BY priority DESC, updated_at DESC").all();
        return rows.map((row) => this.hydrate(row));
    }

    get(id: number): Card {
        const row = this.db.query<CardRow, [number]>("SELECT * FROM cards WHERE id = ?").get(id);
        if (!row) throw new KanbanError(`Card ${id} does not exist`, 404);
        return this.hydrate(row);
    }

    events(id: number): CardEvent[] {
        this.get(id);
        return this.db
            .query<{ id: number; card_id: number; at: number; actor: Actor; kind: CardEvent["kind"]; from_phase: Phase | null; to_phase: Phase | null; text: string | null }, [number]>(
                "SELECT * FROM card_events WHERE card_id = ? ORDER BY id",
            )
            .all(id)
            .map((row) => ({ id: row.id, cardId: row.card_id, at: row.at, actor: row.actor, kind: row.kind, from: row.from_phase, to: row.to_phase, text: row.text }));
    }

    targets(id: number, actor: Actor, now = Date.now()): Target[] {
        const card = this.get(id);
        return targets(card, { actor, now, dependencies: this.dependencyPhases(card) });
    }

    create(title: string, now = Date.now()): Card {
        const name = title.trim();
        if (!name) throw new KanbanError("A card needs a title", 400);
        const last = this.db.query<CardRow, []>("SELECT * FROM cards ORDER BY id DESC LIMIT 1").get();
        const base = last ? this.hydrate(last) : undefined;
        const defaults = Object.fromEntries(inherited.map((field) => [field, base?.[field]]));
        const id = this.db.transaction(() => {
            const result = this.db
                .query(
                    "INSERT INTO cards (title, phase, folder, base_branch, permission, retries, implementer, auditor, created_at, updated_at) VALUES (?, 'triage', ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .run(
                    name,
                    defaults.folder ?? null,
                    defaults.baseBranch ?? null,
                    defaults.permission ?? "auto",
                    defaults.retries ?? 2,
                    JSON.stringify(defaults.implementer ?? emptyRunner),
                    JSON.stringify(defaults.auditor ?? emptyRunner),
                    now,
                    now,
                );
            const created = Number(result.lastInsertRowid);
            this.record(created, "human", "created", null, "triage", null, now);
            return created;
        })();
        return this.get(id);
    }

    edit(id: number, edit: CardEdit, actor: Actor, now = Date.now()): Card {
        const card = this.get(id);
        if (!canEdit(card, actor)) throw new KanbanError(`A card in ${card.phase} cannot be edited`, 409);
        const { dependsOn, ...fields } = edit;
        if (dependsOn) this.checkDependencies(id, dependsOn);
        const changed = Object.keys(edit).filter((key) => JSON.stringify(edit[key as keyof CardEdit]) !== JSON.stringify(card[key as keyof Card]));
        if (changed.length === 0) return card;
        this.db.transaction(() => {
            this.write(id, fields, now);
            if (dependsOn) {
                this.db.query("DELETE FROM card_dependencies WHERE card_id = ?").run(id);
                for (const other of dependsOn) this.db.query("INSERT INTO card_dependencies (card_id, depends_on) VALUES (?, ?)").run(id, other);
            }
            this.record(id, actor, "edited", null, null, changed.join(", "), now);
        })();
        return this.get(id);
    }

    move(id: number, request: MoveRequest, actor: Actor, now = Date.now()): Card {
        const card = this.get(id);
        const result = move(card, request, { actor, now, dependencies: this.dependencyPhases(card) });
        if (!result.ok) throw new KanbanError(result.reason, 409);
        this.db.transaction(() => {
            this.write(id, { ...result.patch, held: null }, now);
            this.record(id, actor, "moved", card.phase, request.to, request.note ?? null, now);
            if (result.next) this.repeat(card, result.next, now);
        })();
        return this.get(id);
    }

    /*
     * Why a due Scheduled card has not started yet (repository busy, uncommitted changes...). The dispatcher writes
     * it every minute, so it only touches the row when the reason changes and never bumps updated_at.
     */
    hold(id: number, reason: string | null): boolean {
        return this.db.query("UPDATE cards SET held = ?1 WHERE id = ?2 AND held IS NOT ?1").run(reason, id).changes > 0;
    }

    setSession(id: number, sessionId: string, now = Date.now()): void {
        if (this.get(id).phase !== "running") throw new KanbanError("Only a running card takes a session", 409);
        this.write(id, { sessionId }, now);
    }

    note(id: number, text: string, actor: Actor, now = Date.now()): CardEvent {
        const card = this.get(id);
        const body = text.trim();
        if (!body) throw new KanbanError("The note is empty", 400);
        const allowed = actor === "human" || actor === "system" || (actor === "agent" && modelPhases.includes(card.phase)) || (actor === "auditor" && card.phase === "review");
        if (!allowed) throw new KanbanError(`The ${actor} cannot write on a card in ${card.phase}`, 409);
        this.record(id, actor, "note", null, null, body, now);
        return this.events(id).at(-1)!;
    }

    verdict(id: number, actor: Actor, ok: boolean, reason: string, now = Date.now()): Card {
        const card = this.get(id);
        const refusal = verdict(card, actor);
        if (refusal) throw new KanbanError(refusal, 409);
        const why = reason.trim();
        if (!why) throw new KanbanError("A verdict needs its reason", 400);
        const field = actor === "auditor" ? "auditorVerdict" : "humanVerdict";
        this.db.transaction(() => {
            this.write(id, { [field]: { ok, reason: why, at: now } }, now);
            this.record(id, actor, "verdict", null, null, `${ok ? "✓" : "✗"} ${why}`, now);
        })();
        return this.get(id);
    }

    addFile(id: number, name: string, content: Uint8Array, now = Date.now()): Card {
        const card = this.get(id);
        if (!canEdit(card, "human")) throw new KanbanError(`Files cannot change on a card in ${card.phase}`, 409);
        const safe = basename(name).replace(/[<>:"/\\|?*]/g, "_");
        if (!safe) throw new KanbanError("The file needs a name", 400);
        this.db.transaction(() => {
            const fileId = Number(this.db.query("INSERT INTO card_files (card_id, name, bytes, at) VALUES (?, ?, ?, ?)").run(id, safe, content.byteLength, now).lastInsertRowid);
            mkdirSync(join(this.filesDir, String(id)), { recursive: true });
            writeFileSync(this.filePath(id, fileId, safe), content);
            this.write(id, {}, now);
            this.record(id, "human", "file", null, null, `Attached ${safe}`, now);
        })();
        return this.get(id);
    }

    file(id: number, fileId: number): { name: string; path: string } {
        const row = this.db.query<{ name: string }, [number, number]>("SELECT name FROM card_files WHERE card_id = ? AND id = ?").get(id, fileId);
        if (!row) throw new KanbanError("The file does not exist", 404);
        return { name: row.name, path: this.filePath(id, fileId, row.name) };
    }

    removeFile(id: number, fileId: number, now = Date.now()): Card {
        const card = this.get(id);
        if (!canEdit(card, "human")) throw new KanbanError(`Files cannot change on a card in ${card.phase}`, 409);
        const { name, path } = this.file(id, fileId);
        this.db.transaction(() => {
            this.db.query("DELETE FROM card_files WHERE id = ?").run(fileId);
            this.write(id, {}, now);
            this.record(id, "human", "file", null, null, `Removed ${name}`, now);
        })();
        rmSync(path, { force: true });
        return this.get(id);
    }

    remove(id: number): void {
        const card = this.get(id);
        if (card.phase !== "triage") throw new KanbanError("Only cards in Triage can be deleted", 409);
        this.db.query("DELETE FROM cards WHERE id = ?").run(id);
        rmSync(join(this.filesDir, String(id)), { recursive: true, force: true });
        rmSync(join(dirname(this.store.path), "runs", String(id)), { recursive: true, force: true });
    }

    private filePath(id: number, fileId: number, name: string) {
        return join(this.filesDir, String(id), `${fileId}-${name}`);
    }

    private repeat(card: Card, next: Partial<Card>, now: number) {
        const result = this.db
            .query(
                `INSERT INTO cards (title, brief, phase, priority, folder, base_branch, permission, implementer, auditor, scheduled_at, recurrence, time_limit_min, retries, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
                card.title,
                card.brief,
                next.phase!,
                card.priority,
                card.folder,
                card.baseBranch,
                card.permission,
                JSON.stringify(card.implementer),
                JSON.stringify(card.auditor),
                next.scheduledAt!,
                card.recurrence,
                card.timeLimitMin,
                card.retries,
                now,
                now,
            );
        const created = Number(result.lastInsertRowid);
        for (const other of card.dependsOn) this.db.query("INSERT INTO card_dependencies (card_id, depends_on) VALUES (?, ?)").run(created, other);
        this.record(created, "system", "created", null, next.phase!, `Next run of #${card.id}`, now);
    }

    private dependencyPhases(card: Card): Phase[] {
        return card.dependsOn.map((other) => this.db.query<{ phase: Phase }, [number]>("SELECT phase FROM cards WHERE id = ?").get(other)?.phase ?? "archived");
    }

    private checkDependencies(id: number, dependsOn: readonly number[]) {
        for (const other of dependsOn) {
            if (other === id) throw new KanbanError("A card cannot depend on itself", 400);
            if (!this.db.query("SELECT 1 FROM cards WHERE id = ?").get(other)) throw new KanbanError(`Card ${other} does not exist`, 400);
        }
        const reaches = (from: number, seen = new Set<number>()): boolean => {
            if (from === id) return true;
            if (seen.has(from)) return false;
            seen.add(from);
            return this.db
                .query<{ depends_on: number }, [number]>("SELECT depends_on FROM card_dependencies WHERE card_id = ?")
                .all(from)
                .some((row) => reaches(row.depends_on, seen));
        };
        if (dependsOn.some((other) => reaches(other))) throw new KanbanError("That dependency would create a cycle", 400);
    }

    private write(id: number, patch: Partial<Card>, now: number) {
        const entries = Object.entries(patch).filter(([key]) => key in columns);
        const sets = [...entries.map(([key]) => `${columns[key]} = ?`), "updated_at = ?"];
        const values = entries.map(([key, value]) => (json.has(key) && value !== null ? JSON.stringify(value) : (value as string | number | null)));
        this.db.query(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`).run(...values, now, id);
    }

    private record(id: number, actor: Actor, kind: CardEvent["kind"], from: Phase | null, to: Phase | null, text: string | null, now: number) {
        this.db.query("INSERT INTO card_events (card_id, at, actor, kind, from_phase, to_phase, text) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, now, actor, kind, from, to, text);
    }

    private hydrate(row: CardRow): Card {
        return {
            id: row.id,
            title: row.title,
            brief: row.brief,
            phase: row.phase,
            route: row.route,
            priority: row.priority,
            folder: row.folder,
            baseBranch: row.base_branch,
            permission: row.permission,
            implementer: Runner.parse(JSON.parse(row.implementer)),
            auditor: Runner.parse(JSON.parse(row.auditor)),
            scheduledAt: row.scheduled_at,
            recurrence: row.recurrence,
            timeLimitMin: row.time_limit_min,
            retries: row.retries,
            sessionId: row.session_id,
            auditorVerdict: verdictOf(row.auditor_verdict),
            humanVerdict: verdictOf(row.human_verdict),
            blockedReason: row.blocked_reason,
            held: row.held,
            dependsOn: this.db
                .query<{ depends_on: number }, [number]>("SELECT depends_on FROM card_dependencies WHERE card_id = ? ORDER BY depends_on")
                .all(row.id)
                .map((dep) => dep.depends_on),
            files: this.db.query<{ id: number; name: string; bytes: number; at: number }, [number]>("SELECT id, name, bytes, at FROM card_files WHERE card_id = ? ORDER BY id").all(row.id),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}
