import { existsSync } from "node:fs";
import { basename } from "node:path";

export interface GitResult {
    ok: boolean;
    out: string;
    err: string;
}

export async function git(cwd: string, ...args: string[]): Promise<GitResult> {
    const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe", windowsHide: true });
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { ok: code === 0, out: out.trim(), err: err.trim() };
}

export const branchFor = (id: number, title: string) => {
    const slug = title
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
        .replace(/-+$/, "");
    return `feature/develop/card-${id}${slug ? `-${slug}` : ""}`;
};

const hasBranch = async (folder: string, name: string) => (await git(folder, "rev-parse", "--verify", "--quiet", `refs/heads/${name}`)).ok;

/* The card's own base branch, else develop when it exists, else origin's default branch. */
export async function resolveBase(folder: string, base: string | null): Promise<{ base: string } | { held: string }> {
    const name = basename(folder);
    if (base) return (await hasBranch(folder, base)) ? { base } : { held: `${name} has no branch ${base}` };
    if (await hasBranch(folder, "develop")) return { base: "develop" };
    const origin = await git(folder, "symbolic-ref", "--short", "refs/remotes/origin/HEAD");
    if (origin.ok) return { base: origin.out.replace(/^origin\//, "") };
    return { held: `${name} has no develop branch and no origin default; set a base branch on the card` };
}

/*
 * A repository is ready for a run when it sits on the card's base branch with a clean tree. Anything else holds
 * the card, with the reason, until the repository is ready again. A card coming back to a repository may also
 * find it still on its own branch, with the work it left, and carries on there.
 */
export async function readiness(folder: string, base: string | null, own?: string): Promise<{ base: string } | { held: string }> {
    if (!existsSync(folder)) return { held: `The folder ${folder} does not exist` };
    const name = basename(folder);
    if (!(await git(folder, "rev-parse", "--show-toplevel")).ok) return { held: `${name} is not a git repository` };
    const resolved = await resolveBase(folder, base);
    if ("held" in resolved) return resolved;
    const current = (await git(folder, "branch", "--show-current")).out;
    if (own && current === own) return resolved;
    if (current !== resolved.base) return { held: `${name} is on ${current || "a detached HEAD"}, not ${resolved.base}` };
    if ((await git(folder, "status", "--porcelain")).out) return { held: `${name} has uncommitted changes` };
    return resolved;
}

export async function checkout(folder: string, branch: string, base: string): Promise<GitResult> {
    return (await hasBranch(folder, branch)) ? git(folder, "switch", branch) : git(folder, "switch", "-c", branch, base);
}

/* Commits whatever the run left on its branch. Hooks run as usual; a failing hook is reported, never skipped. */
export async function commit(folder: string, message: string): Promise<{ sha?: string; error?: string }> {
    const added = await git(folder, "add", "-A");
    if (!added.ok) return { error: added.err };
    if ((await git(folder, "diff", "--cached", "--quiet")).ok) return {};
    const committed = await git(folder, "commit", "-m", message);
    if (!committed.ok) return { error: committed.err || committed.out };
    return { sha: (await git(folder, "rev-parse", "--short", "HEAD")).out };
}
