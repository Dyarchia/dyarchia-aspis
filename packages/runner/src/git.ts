import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

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

const ignored = ".claude/worktrees/";
const marker = "# dyarchia kanban worktrees, written by the board that points here";

const same = (left: string, right: string) => {
    const clean = (path: string) => resolve(path).replace(/[\\/]+$/, "");
    return process.platform === "win32" ? clean(left).toLowerCase() === clean(right).toLowerCase() : clean(left) === clean(right);
};

async function worktrees(folder: string): Promise<{ path: string; branch?: string; locked: boolean }[]> {
    const listed = await git(folder, "worktree", "list", "--porcelain");
    if (!listed.ok) return [];
    return listed.out
        .split(/\r?\n\r?\n/)
        .map((block) => {
            const lines = block.split(/\r?\n/);
            const value = (key: string) => lines.find((line) => line === key || line.startsWith(`${key} `))?.slice(key.length + 1);
            return { path: value("worktree") ?? "", branch: value("branch")?.replace(/^refs\/heads\//, ""), locked: value("locked") !== undefined };
        })
        .filter((tree) => tree.path);
}

/*
 * Keeps the runs' worktrees out of the project's own git status the way Desktop does: one line in the repository's
 * info/exclude, which is never committed, written once and recognised by Desktop and Aspis alike.
 */
async function exclude(folder: string): Promise<void> {
    if ((await git(folder, "check-ignore", "-q", ignored)).ok) return;
    const common = await git(folder, "rev-parse", "--git-common-dir");
    if (!common.ok) return;
    const info = join(isAbsolute(common.out) ? common.out : resolve(folder, common.out), "info");
    mkdirSync(info, { recursive: true });
    const path = join(info, "exclude");
    const held = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (held.split(/\r?\n/).some((line) => line.trim() === ignored)) return;
    appendFileSync(path, `${held && !held.endsWith("\n") ? "\n" : ""}${marker}\n${ignored}\n`);
}

/*
 * Gives a Scheduled run its worktree: the one it left behind when it comes back to the card, else a new one on the
 * card's branch, made from the base the first time. The project's own checkout is never switched or checked, so
 * whatever you have open there stays as it is. A branch that is checked out somewhere else holds the card.
 */
export async function prepare(folder: string, base: string | null, branch: string, path: string): Promise<{ base: string } | { held: string }> {
    if (!existsSync(folder)) return { held: `The folder ${folder} does not exist` };
    const name = basename(folder);
    if (!(await git(folder, "rev-parse", "--show-toplevel")).ok) return { held: `${name} is not a git repository` };
    const resolved = await resolveBase(folder, base);
    if ("held" in resolved) return resolved;
    await exclude(folder);
    await git(folder, "worktree", "prune");
    const trees = await worktrees(folder);
    if (trees.some((tree) => same(tree.path, path))) return resolved;
    const elsewhere = trees.find((tree) => tree.branch === branch);
    if (elsewhere) return { held: `${branch} is checked out in ${elsewhere.path}; switch that checkout to another branch` };
    const added = (await hasBranch(folder, branch)) ? await git(folder, "worktree", "add", path, branch) : await git(folder, "worktree", "add", "-b", branch, path, resolved.base);
    return added.ok ? resolved : { held: `Could not make the worktree for ${branch}: ${added.err || added.out}` };
}

/*
 * Takes a card's worktree away while keeping its branch, so the branch can be checked out elsewhere. A worktree
 * holding changes nobody committed is never removed.
 */
export async function release(folder: string, path: string): Promise<{ error?: string }> {
    if (!existsSync(path)) return {};
    if ((await git(path, "status", "--porcelain")).out) return { error: `${path} holds changes nobody committed` };
    const removed = await git(folder, "worktree", "remove", path);
    await git(folder, "worktree", "prune");
    return removed.ok ? {} : { error: removed.err || `git would not remove ${path}` };
}

/*
 * Tidies a repository with Desktop's rules: a card worktree whose branch has landed in the checkout's HEAD, with
 * nothing uncommitted and no run alive in it, goes away with its branch. Anything else stays where it is.
 */
export async function sweep(folder: string, busy: (path: string) => boolean): Promise<string[]> {
    if (!existsSync(folder)) return [];
    const root = join(folder, ".claude", "worktrees");
    const swept: string[] = [];
    for (const tree of await worktrees(folder)) {
        const step = relative(resolve(root), resolve(tree.path));
        if (!step || step.startsWith("..") || isAbsolute(step) || !tree.branch || busy(tree.path)) continue;
        if (!(await git(folder, "merge-base", "--is-ancestor", tree.branch, "HEAD")).ok) continue;
        if ((await git(tree.path, "status", "--porcelain")).out) continue;
        if (tree.locked) await git(folder, "worktree", "unlock", tree.path);
        if (!(await git(folder, "worktree", "remove", tree.path)).ok) continue;
        await git(folder, "branch", "-d", tree.branch);
        swept.push(tree.path);
    }
    await git(folder, "worktree", "prune");
    return swept;
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
