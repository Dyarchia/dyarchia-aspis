import type { Card, Permission, Runner } from "@dyarchia/core";

/*
 * Headless runs have nobody to answer a permission prompt, so "ask" becomes dontAsk: whatever would have asked is
 * denied and shows up in the log. The other modes map one to one.
 */
const permissionArgs: Record<Permission, string[]> = {
    auto: ["--permission-mode", "auto"],
    ask: ["--permission-mode", "dontAsk"],
    plan: ["--permission-mode", "plan"],
    bypass: ["--dangerously-skip-permissions"],
};

/* The auditor reads and inspects git history; it can never change the working tree. */
const auditorAccess = ["--permission-mode", "dontAsk", "--allowedTools", "Read Grep Glob Bash(git diff:*) Bash(git log:*) Bash(git show:*) Bash(git status:*)"];

export function claudeCommand(): string[] | undefined {
    const override = process.env.ASPIS_CLAUDE;
    if (override) return override.endsWith(".ts") ? [process.execPath, override] : [override];
    const found = Bun.which("claude");
    return found ? [found] : undefined;
}

export interface Session {
    id: string;
    resume: boolean;
}

interface Launch {
    runner: Runner;
    access: string[];
    session: Session;
    system?: string;
    dirs?: readonly string[];
}

function claudeArgs({ runner, access, session, system, dirs = [] }: Launch): string[] {
    return [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        ...(runner.model ? ["--model", runner.model] : []),
        ...(runner.effort ? ["--effort", runner.effort] : []),
        ...access,
        ...(session.resume ? ["--resume", session.id] : ["--session-id", session.id]),
        ...(system ? ["--append-system-prompt", system] : []),
        ...dirs.flatMap((dir) => ["--add-dir", dir]),
    ];
}

export const implementerArgs = (card: Card, session: Session, system: string, dirs: readonly string[]) =>
    claudeArgs({ runner: card.implementer, access: permissionArgs[card.permission], session, system, dirs });

export const auditorArgs = (card: Card, session: Session) => claudeArgs({ runner: card.auditor, access: auditorAccess, session });

export const systemPrompt = (card: Card, branch: string, worktree: string, files: string) =>
    [
        `You are running unattended for the Dyarchia Aspis kanban, card #${card.id} "${card.title}". Nobody can answer you during this run.`,
        `Work in ${worktree}, a git worktree of ${card.folder} on the branch ${branch}, which is already checked out. Change files only there, never in ${card.folder} itself. Do not switch branches, push or open pull requests: the runner commits your changes when you finish.`,
        card.files.length > 0 ? `The files attached to the card are in ${files}.` : "",
        "If you cannot continue without information only a human has, stop and make the last line of your final message: BLOCKED: <what you need>.",
    ]
        .filter(Boolean)
        .join("\n");

export const auditPrompt = (card: Card, summary: string, base: string, branch: string) =>
    [
        `You are the auditor of card #${card.id} "${card.title}" on the Dyarchia Aspis kanban. You only judge the work; you never change files, and nobody can answer you during this run.`,
        `Brief given to the implementer:\n${card.brief.trim()}`,
        `What the implementer says it delivered:\n${summary.trim() || "(no summary)"}`,
        `The work is on the branch ${branch}, made from ${base}, in ${card.folder}. Inspect it with git diff ${base}...${branch}, git log ${base}..${branch} and git show ${branch}:<path>.`,
        "Judge whether the branch does what the brief asks, correctly and completely. End your answer with exactly one line: VERDICT: PASS <why> or VERDICT: FAIL <why>.",
    ].join("\n\n");
