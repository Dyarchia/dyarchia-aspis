import type { Card, Permission } from "@dyarchia/core";

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

export function claudeArgs(card: Card, session: Session, system: string, dirs: readonly string[]): string[] {
    const { model, effort } = card.implementer;
    return [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        ...(model ? ["--model", model] : []),
        ...(effort ? ["--effort", effort] : []),
        ...permissionArgs[card.permission],
        ...(session.resume ? ["--resume", session.id] : ["--session-id", session.id]),
        "--append-system-prompt",
        system,
        ...dirs.flatMap((dir) => ["--add-dir", dir]),
    ];
}

export const systemPrompt = (card: Card, branch: string, files: string) =>
    [
        `You are running unattended for the Dyarchia Aspis kanban, card #${card.id} "${card.title}". Nobody can answer you during this run.`,
        `Work in ${card.folder} on the branch ${branch}, which is already checked out. Do not switch branches, push or open pull requests: the runner commits your changes when you finish.`,
        card.files.length > 0 ? `The files attached to the card are in ${files}.` : "",
        "If you cannot continue without information only a human has, stop and make the last line of your final message: BLOCKED: <what you need>.",
    ]
        .filter(Boolean)
        .join("\n");
