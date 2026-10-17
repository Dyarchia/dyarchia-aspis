import { describe, expect, test } from "bun:test";
import { type Actor, type Card, type MoveRequest, type Phase, emptyRunner, move, nextOccurrence, targets, verdict } from "./kanban.ts";

const now = new Date(2026, 9, 13, 9, 0).getTime();
const runner = { harness: "claude-code", model: "claude-opus-5-5", effort: "high" };

const card = (overrides: Partial<Card> = {}): Card => ({
    id: 1,
    title: "Refactor the trigger handler",
    brief: "Move the pricing rules to a selector class",
    phase: "triage",
    route: null,
    priority: 0,
    board: 1,
    folder: "C:/repo",
    baseBranch: "develop",
    permission: "auto",
    implementer: runner,
    auditor: runner,
    scheduledAt: now - 1000,
    recurrence: null,
    timeLimitMin: null,
    retries: 2,
    sessionId: null,
    auditorVerdict: null,
    humanVerdict: null,
    blockedReason: null,
    held: null,
    wakeAt: null,
    dependsOn: [],
    files: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
});

const attempt = (from: Partial<Card>, to: Phase, actor: Actor, extra: Omit<MoveRequest, "to"> = {}, dependencies: Phase[] = []) =>
    move(card(from), { to, ...extra }, { actor, now, dependencies });

const ok = { ok: true };
const refused = (reason: string) => ({ ok: false, reason: expect.stringContaining(reason) });

describe("transitions from docs/kanban.md", () => {
    test("triage to scheduled needs brief, implementer and date", () => {
        expect(attempt({}, "scheduled", "human")).toMatchObject(ok);
        expect(attempt({ brief: " " }, "scheduled", "human")).toMatchObject(refused("brief"));
        expect(attempt({ implementer: emptyRunner }, "scheduled", "human")).toMatchObject(refused("implementer"));
        expect(attempt({ scheduledAt: null }, "scheduled", "human")).toMatchObject(refused("date"));
    });

    test("triage to ready needs brief, implementer and auditor", () => {
        expect(attempt({ scheduledAt: null }, "ready", "human")).toMatchObject(ok);
        expect(attempt({ auditor: emptyRunner }, "ready", "human")).toMatchObject(refused("auditor"));
    });

    test("scheduled and ready swap with their own guard and both return to triage freely", () => {
        expect(attempt({ phase: "scheduled", auditor: emptyRunner }, "ready", "human")).toMatchObject(refused("auditor"));
        expect(attempt({ phase: "scheduled" }, "ready", "human")).toMatchObject(ok);
        expect(attempt({ phase: "ready", scheduledAt: null }, "scheduled", "human")).toMatchObject(refused("date"));
        expect(attempt({ phase: "ready" }, "scheduled", "human")).toMatchObject(ok);
        expect(attempt({ phase: "scheduled", brief: "" }, "triage", "human")).toMatchObject(ok);
        expect(attempt({ phase: "ready" }, "triage", "human")).toMatchObject(ok);
    });

    test("the system starts a scheduled card when its time comes and its dependencies are done", () => {
        expect(attempt({ phase: "scheduled" }, "running", "system")).toEqual({ ok: true, patch: { phase: "running", route: "scheduled" } });
        expect(attempt({ phase: "scheduled", scheduledAt: now + 60_000 }, "running", "system")).toMatchObject(refused("time"));
        expect(attempt({ phase: "scheduled" }, "running", "system", {}, ["review"])).toMatchObject(refused("dependency"));
        expect(attempt({ phase: "scheduled" }, "running", "system", {}, ["done", "archived"])).toMatchObject(ok);
    });

    test("an agent picks a ready card and its session id is kept", () => {
        expect(attempt({ phase: "ready" }, "running", "agent", { sessionId: "s-1" })).toEqual({
            ok: true,
            patch: { phase: "running", route: "ready", sessionId: "s-1" },
        });
        expect(attempt({ phase: "ready" }, "running", "agent")).toMatchObject(refused("session"));
        expect(attempt({ phase: "ready" }, "running", "human", { sessionId: "s-1" })).toMatchObject(refused("Only the agent"));
    });

    test("running blocks with a reason, from the agent or the system", () => {
        expect(attempt({ phase: "running" }, "blocked", "agent", { note: "Which org?" })).toMatchObject({ ok: true, patch: { blockedReason: "Which org?" } });
        expect(attempt({ phase: "running" }, "blocked", "system", { note: "Retries exhausted" })).toMatchObject(ok);
        expect(attempt({ phase: "running" }, "blocked", "agent")).toMatchObject(refused("reason"));
    });

    test("running goes to review only through ready and to archived only through scheduled", () => {
        expect(attempt({ phase: "running", route: "ready" }, "review", "agent", { note: "Done" })).toMatchObject(ok);
        expect(attempt({ phase: "running", route: "ready" }, "review", "agent")).toMatchObject(refused("summary"));
        expect(attempt({ phase: "running", route: "scheduled" }, "review", "agent", { note: "Done" })).toMatchObject(refused("through ready"));
        expect(attempt({ phase: "running", route: "scheduled" }, "archived", "system")).toEqual({ ok: true, patch: { phase: "archived" } });
        expect(attempt({ phase: "running", route: "ready" }, "archived", "system")).toMatchObject(refused("through scheduled"));
    });

    test("a recurring scheduled card is archived and a new one is scheduled for the next date", () => {
        const result = attempt({ phase: "running", route: "scheduled", recurrence: "daily", scheduledAt: now }, "archived", "system");
        expect(result).toMatchObject({ ok: true, next: { phase: "scheduled", scheduledAt: nextOccurrence(now, "daily") } });
    });

    test("a recurring card that missed its dates while the machine was off schedules the next one ahead", () => {
        const threeDaysAgo = now - 3 * 86_400_000 + 60_000;
        const result = attempt({ phase: "running", route: "scheduled", recurrence: "daily", scheduledAt: threeDaysAgo }, "archived", "system");
        expect(result).toMatchObject({ ok: true, next: { scheduledAt: now + 60_000 } });
    });

    test("done needs the auditor's check and yours, both approving", () => {
        const yes = { ok: true, reason: "Fine", at: now };
        const no = { ok: false, reason: "Tests missing", at: now };
        expect(attempt({ phase: "review", auditorVerdict: yes, humanVerdict: yes }, "done", "human")).toMatchObject(ok);
        expect(attempt({ phase: "review", auditorVerdict: no, humanVerdict: yes }, "done", "human")).toMatchObject(refused("auditor"));
        expect(attempt({ phase: "review", auditorVerdict: yes }, "done", "human")).toMatchObject(refused("Your check"));
    });

    test("a rejection sends the card back to running with notes and clears both checks", () => {
        const no = { ok: false, reason: "Tests missing", at: now };
        expect(attempt({ phase: "review", auditorVerdict: no }, "running", "human", { note: "Add tests" })).toEqual({
            ok: true,
            patch: { phase: "running", auditorVerdict: null, humanVerdict: null },
        });
        expect(attempt({ phase: "review" }, "running", "human", { note: "Add tests" })).toMatchObject(refused("A rejection"));
        expect(attempt({ phase: "review", auditorVerdict: { ok: true, reason: "Fine", at: now } }, "running", "human", { note: "x" })).toMatchObject(refused("A rejection"));
        expect(attempt({ phase: "review", auditorVerdict: no }, "running", "human")).toMatchObject(refused("rejection"));
    });

    test("only you unblock, answering first to go back to running or ready", () => {
        const blocked = { phase: "blocked" as const, blockedReason: "Which org?", route: "ready" as const };
        expect(attempt(blocked, "running", "human", { note: "Use UAT" })).toEqual({ ok: true, patch: { phase: "running", blockedReason: null } });
        expect(attempt(blocked, "ready", "human", { note: "Pick it up again" })).toMatchObject({ ok: true, patch: { route: null } });
        expect(attempt(blocked, "running", "human")).toMatchObject(refused("answer"));
        expect(attempt(blocked, "triage", "human")).toMatchObject(ok);
        expect(attempt(blocked, "running", "agent", { note: "x" })).toMatchObject(refused("Only the human"));
    });

    test("done is archived by you", () => {
        expect(attempt({ phase: "done" }, "archived", "human")).toMatchObject(ok);
    });
});

describe("refused moves", () => {
    test.each([
        ["triage", "running", "human"],
        ["triage", "done", "human"],
        ["triage", "ready", "agent"],
        ["ready", "review", "agent"],
        ["review", "done", "auditor"],
        ["review", "running", "auditor"],
        ["running", "done", "agent"],
        ["archived", "triage", "human"],
    ] as const)("%s to %s by %s", (from, to, actor) => {
        expect(attempt({ phase: from, route: "ready" }, to, actor, { note: "x", sessionId: "s" }).ok).toBe(false);
    });
});

describe("verdicts", () => {
    test("the auditor speaks once and first, then you", () => {
        expect(verdict(card({ phase: "review" }), "auditor")).toBeUndefined();
        expect(verdict(card({ phase: "review" }), "human")).toContain("auditor speaks first");
        const audited = card({ phase: "review", auditorVerdict: { ok: false, reason: "x", at: now } });
        expect(verdict(audited, "auditor")).toContain("already");
        expect(verdict(audited, "human")).toBeUndefined();
        expect(verdict(card({ phase: "running" }), "auditor")).toContain("Review");
        expect(verdict(card({ phase: "review" }), "agent")).toBeDefined();
    });

    test("when the audit could not run you may reject, never approve", () => {
        const stuck = card({ phase: "review", held: "Could not audit: codex cannot audit headless yet" });
        expect(verdict(stuck, "human", false)).toBeUndefined();
        expect(verdict(stuck, "human", true)).toContain("Approving needs the auditor");
    });
});

describe("targets", () => {
    test("lists only your moves, with the guard that stops each and the note it needs", () => {
        expect(targets(card({ auditor: emptyRunner }), { actor: "human", now, dependencies: [] })).toEqual([
            { to: "scheduled", reason: undefined, note: undefined },
            { to: "ready", reason: "The auditor needs a harness and a model", note: undefined },
        ]);
        expect(targets(card({ phase: "blocked" }), { actor: "human", now, dependencies: [] }).map((target) => target.note)).toEqual([
            "Your answer",
            "Your answer",
            undefined,
        ]);
    });
});

describe("next occurrence", () => {
    test("weekdays skip the weekend and months clamp to their last day", () => {
        const friday = new Date(2026, 9, 16, 8, 30).getTime();
        expect(new Date(nextOccurrence(friday, "weekdays")).getDay()).toBe(1);
        expect(new Date(nextOccurrence(friday, "weekly")).getDate()).toBe(23);
        const endOfJanuary = new Date(2027, 0, 31, 8, 30).getTime();
        const february = new Date(nextOccurrence(endOfJanuary, "monthly"));
        expect([february.getMonth(), february.getDate(), february.getHours()]).toEqual([1, 28, 8]);
    });
});
