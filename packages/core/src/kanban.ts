import { z } from "zod";

export const phases = ["triage", "scheduled", "ready", "running", "blocked", "review", "done", "archived"] as const;
export const Phase = z.enum(phases);
export type Phase = z.infer<typeof Phase>;

export const Actor = z.enum(["human", "agent", "system", "auditor"]);
export type Actor = z.infer<typeof Actor>;

export const Route = z.enum(["scheduled", "ready"]);
export type Route = z.infer<typeof Route>;

export const Permission = z.enum(["auto", "ask", "plan", "bypass"]);
export type Permission = z.infer<typeof Permission>;

export const Recurrence = z.enum(["daily", "weekdays", "weekly", "monthly"]);
export type Recurrence = z.infer<typeof Recurrence>;

export const Runner = z.object({
    harness: z.string().nullable(),
    model: z.string().nullable(),
    effort: z.string().nullable(),
});
export type Runner = z.infer<typeof Runner>;

export const emptyRunner: Runner = { harness: null, model: null, effort: null };

export const Verdict = z.object({ ok: z.boolean(), reason: z.string(), at: z.number() });
export type Verdict = z.infer<typeof Verdict>;

export const CardFile = z.object({ id: z.number().int(), name: z.string(), bytes: z.number().int(), at: z.number() });
export type CardFile = z.infer<typeof CardFile>;

export const MaxRunning = z.number().int().min(1).max(10);

export const BoardRunners = z.object({ implementer: Runner, auditor: Runner });
export type BoardRunners = z.infer<typeof BoardRunners>;

export const Board = z.object({
    id: z.number().int(),
    name: z.string(),
    folder: z.string(),
    archived: z.boolean(),
    maxRunning: MaxRunning,
    runners: BoardRunners,
    createdAt: z.number(),
});
export type Board = z.infer<typeof Board>;

export const BoardDraft = z.object({
    name: z.string().trim().min(1, "The board needs a name"),
    folder: z.string().trim().min(1, "The board needs a folder"),
    maxRunning: MaxRunning.optional(),
    runners: BoardRunners.optional(),
});
export type BoardDraft = z.infer<typeof BoardDraft>;

export const BoardEdit = BoardDraft.partial().extend({ archived: z.boolean().optional() });
export type BoardEdit = z.infer<typeof BoardEdit>;

export const Card = z.object({
    id: z.number().int(),
    board: z.number().int(),
    title: z.string(),
    brief: z.string(),
    phase: Phase,
    route: Route.nullable(),
    priority: z.number().int(),
    folder: z.string().nullable(),
    baseBranch: z.string().nullable(),
    permission: Permission,
    implementer: Runner,
    auditor: Runner,
    scheduledAt: z.number().nullable(),
    recurrence: Recurrence.nullable(),
    timeLimitMin: z.number().int().positive().nullable(),
    retries: z.number().int().min(0),
    sessionId: z.string().nullable(),
    auditorVerdict: Verdict.nullable(),
    humanVerdict: Verdict.nullable(),
    blockedReason: z.string().nullable(),
    held: z.string().nullable(),
    wakeAt: z.number().nullable(),
    dependsOn: z.array(z.number().int()),
    files: z.array(CardFile),
    createdAt: z.number(),
    updatedAt: z.number(),
});
export type Card = z.infer<typeof Card>;

export const editableFields = [
    "title",
    "brief",
    "priority",
    "folder",
    "baseBranch",
    "permission",
    "implementer",
    "auditor",
    "scheduledAt",
    "recurrence",
    "timeLimitMin",
    "retries",
    "dependsOn",
] as const;

export const CardEdit = Card.pick(Object.fromEntries(editableFields.map((field) => [field, true])) as { [K in (typeof editableFields)[number]]: true })
    .partial()
    .extend({ title: z.string().trim().min(1).optional() });
export type CardEdit = z.infer<typeof CardEdit>;

export const CardEvent = z.object({
    id: z.number().int(),
    cardId: z.number().int(),
    at: z.number(),
    actor: Actor,
    kind: z.enum(["created", "moved", "edited", "note", "verdict", "file"]),
    from: Phase.nullable(),
    to: Phase.nullable(),
    text: z.string().nullable(),
});
export type CardEvent = z.infer<typeof CardEvent>;

export const MoveRequest = z.object({
    to: Phase,
    note: z.string().trim().min(1).optional(),
    sessionId: z.string().min(1).optional(),
});
export type MoveRequest = z.infer<typeof MoveRequest>;

export interface MoveContext {
    actor: Actor;
    now: number;
    dependencies: readonly Phase[];
}

export type MoveResult = { ok: true; patch: Partial<Card>; next?: Partial<Card> } | { ok: false; reason: string };

type Guard = (card: Card, request: MoveRequest, context: MoveContext) => string | undefined;
type Effect = (card: Card, request: MoveRequest, context: MoveContext) => Partial<Card>;

interface Rule {
    from: Phase;
    to: Phase;
    actor: Actor;
    guards: Guard[];
    note?: string;
    effect?: Effect;
}

const runnerReady = (runner: Runner) => Boolean(runner.harness && runner.model);
const needs = (test: (card: Card, request: MoveRequest, context: MoveContext) => unknown, reason: string): Guard =>
    (card, request, context) => (test(card, request, context) ? undefined : reason);

const brief = needs((card) => card.brief.trim(), "The brief is empty");
const implementer = needs((card) => runnerReady(card.implementer), "The implementer needs a harness and a model");
const auditor = needs((card) => runnerReady(card.auditor), "The auditor needs a harness and a model");
const date = needs((card) => card.scheduledAt !== null, "The card has no date and time");
const dependencies = needs((_, __, context) => context.dependencies.every((phase) => phase === "done" || phase === "archived"), "A dependency is not done yet");
const fromRoute = (route: Route) => needs((card) => card.route === route, `Only cards that came through ${route} can do this`);
const unblocked: Partial<Card> = { blockedReason: null };

/*
 * Every row of the transition table in docs/kanban.md, nothing else. A move that is not listed is refused,
 * whoever asks for it.
 */
const rules: Rule[] = [
    { from: "triage", to: "scheduled", actor: "human", guards: [brief, implementer, date] },
    { from: "triage", to: "ready", actor: "human", guards: [brief, implementer, auditor] },
    { from: "scheduled", to: "ready", actor: "human", guards: [auditor] },
    { from: "ready", to: "scheduled", actor: "human", guards: [date] },
    { from: "scheduled", to: "triage", actor: "human", guards: [] },
    { from: "ready", to: "triage", actor: "human", guards: [] },
    {
        from: "scheduled",
        to: "running",
        actor: "system",
        guards: [date, needs((card, _, context) => card.scheduledAt! <= context.now, "Its time has not come yet"), dependencies],
        effect: () => ({ route: "scheduled" }),
    },
    {
        from: "ready",
        to: "running",
        actor: "agent",
        guards: [needs((_, request) => request.sessionId, "The session id is required"), dependencies],
        effect: (_, request) => ({ route: "ready", sessionId: request.sessionId! }),
    },
    { from: "running", to: "blocked", actor: "agent", guards: [], note: "The reason", effect: (_, request) => ({ blockedReason: request.note! }) },
    { from: "running", to: "blocked", actor: "system", guards: [], note: "The technical reason", effect: (_, request) => ({ blockedReason: request.note! }) },
    { from: "running", to: "review", actor: "agent", guards: [fromRoute("ready")], note: "A summary of the work" },
    { from: "running", to: "archived", actor: "system", guards: [fromRoute("scheduled")] },
    {
        from: "review",
        to: "done",
        actor: "human",
        guards: [
            needs((card) => card.auditorVerdict?.ok, "The auditor has not approved it"),
            needs((card) => card.humanVerdict?.ok, "Your check is missing"),
        ],
    },
    {
        from: "review",
        to: "running",
        actor: "human",
        guards: [needs((card) => card.auditorVerdict?.ok === false || card.humanVerdict?.ok === false, "A rejection from the auditor or from you comes first")],
        note: "The rejection notes",
        effect: () => ({ auditorVerdict: null, humanVerdict: null }),
    },
    { from: "blocked", to: "running", actor: "human", guards: [], note: "Your answer", effect: () => unblocked },
    { from: "blocked", to: "ready", actor: "human", guards: [], note: "Your answer", effect: () => ({ ...unblocked, route: null }) },
    {
        from: "blocked",
        to: "triage",
        actor: "human",
        guards: [],
        effect: () => ({ ...unblocked, route: null, auditorVerdict: null, humanVerdict: null }),
    },
    { from: "done", to: "archived", actor: "human", guards: [] },
];

export function nextOccurrence(at: number, recurrence: Recurrence): number {
    const next = new Date(at);
    if (recurrence === "daily") next.setDate(next.getDate() + 1);
    if (recurrence === "weekly") next.setDate(next.getDate() + 7);
    if (recurrence === "weekdays") {
        do next.setDate(next.getDate() + 1);
        while (next.getDay() === 0 || next.getDay() === 6);
    }
    if (recurrence === "monthly") {
        const day = next.getDate();
        next.setDate(1);
        next.setMonth(next.getMonth() + 1);
        next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    }
    return next.getTime();
}

export function move(card: Card, request: MoveRequest, context: MoveContext): MoveResult {
    const candidates = rules.filter((rule) => rule.from === card.phase && rule.to === request.to);
    if (candidates.length === 0) return { ok: false, reason: `A card cannot go from ${card.phase} to ${request.to}` };
    const rule = candidates.find((candidate) => candidate.actor === context.actor);
    if (!rule) return { ok: false, reason: `Only the ${candidates.map((candidate) => candidate.actor).join(" or ")} can move it from ${card.phase} to ${request.to}` };
    for (const guard of rule.guards) {
        const reason = guard(card, request, context);
        if (reason) return { ok: false, reason };
    }
    if (rule.note && !request.note) return { ok: false, reason: `${rule.note} is required` };
    const patch: Partial<Card> = { phase: request.to, ...rule.effect?.(card, request, context) };
    const repeat = rule.to === "archived" && rule.actor === "system" && card.recurrence && card.scheduledAt !== null;
    if (!repeat) return { ok: true, patch };
    let at = nextOccurrence(card.scheduledAt!, card.recurrence!);
    while (at <= context.now) at = nextOccurrence(at, card.recurrence!);
    return { ok: true, patch, next: { phase: "scheduled", scheduledAt: at } };
}

export interface Target {
    to: Phase;
    reason?: string;
    note?: string;
}

export function targets(card: Card, context: MoveContext): Target[] {
    return rules
        .filter((rule) => rule.from === card.phase && rule.actor === context.actor)
        .map((rule) => ({
            to: rule.to,
            reason: rule.guards.map((guard) => guard(card, { to: rule.to, sessionId: "pending" }, context)).find(Boolean),
            note: rule.note,
        }));
}

export function canEdit(card: Card, actor: Actor) {
    return actor === "human" && (card.phase === "triage" || card.phase === "scheduled" || card.phase === "ready");
}

/*
 * The auditor speaks first and you decide after it. The one exception is an audit that could not run (its reason
 * is held on the card): you may still reject the card and send it back, but approving it always needs the auditor.
 */
export function verdict(card: Card, actor: Actor, ok = true): string | undefined {
    if (card.phase !== "review") return "Verdicts only exist in Review";
    if (actor === "auditor") return card.auditorVerdict ? "The auditor already gave its verdict" : undefined;
    if (actor !== "human") return "Only the auditor and you give verdicts";
    if (card.auditorVerdict) return undefined;
    if (card.held && !ok) return undefined;
    return card.held ? "Approving needs the auditor; you can still reject it" : "The auditor speaks first";
}

export const harnesses = ["claude-code", "codex", "grok-build", "antigravity", "mistral-vibe"] as const;

/* What the human types in each CLI that has the Aspis hooks, and how they reopen a card's session there. */
export const pickupCommands: Partial<Record<string, string>> = { "claude-code": "/dya-pickup" };
export const resumeCommands: Partial<Record<string, (session: string) => string>> = {
    "claude-code": (session) => `claude --resume ${session}`,
};
export const efforts = ["low", "medium", "high", "xhigh", "max"] as const;

export const phaseLabels: Record<Phase, string> = {
    triage: "Triage",
    scheduled: "Scheduled",
    ready: "Ready",
    running: "Running",
    blocked: "Blocked",
    review: "Review",
    done: "Done",
    archived: "Archived",
};

export const CardDetail = z.object({
    card: Card,
    events: z.array(CardEvent),
    delivered: z.number().int(),
    targets: z.array(z.object({ to: Phase, reason: z.string().optional(), note: z.string().optional() })),
});
export type CardDetail = z.infer<typeof CardDetail>;
