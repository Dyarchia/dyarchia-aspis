import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export interface Result {
    ok: boolean;
    out: string;
    err: string;
}

export type Exec = (command: string[], cwd?: string) => Promise<Result>;

const run: Exec = async (command, cwd) => {
    const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe", windowsHide: true });
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { ok: code === 0, out: out.trim(), err: err.trim() };
};

export class LibraryError extends Error {}

export interface Change {
    path: string;
    status: "added" | "modified" | "deleted";
}

export interface PullRequest {
    url: string;
    state: "OPEN" | "MERGED" | "CLOSED";
}

export interface RepoStatus {
    path: string;
    remote: string | null;
    branch: string;
    base: string;
    changes: Change[];
    pr: PullRequest | null;
}

export interface LibraryRepoOptions {
    path: string;
    exec?: Exec;
    gh?: string[];
}

const folders = ["skills", "agents", "prompts", "commands", "rules", "hooks", "plugins", "mods"] as const;

const slug = (text: string) =>
    text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
        .replace(/-+$/, "") || "changes";

/*
 * The user's library: a GitHub repository cloned under ~/.dyarchia-aspis/library. Pieces are edited on the working
 * tree. Publishing never touches the base branch: it moves the changes to a feature/ branch, pushes it and opens a
 * pull request to develop for the user to merge. While that pull request is open, later publishes add commits to
 * it; once it is merged, sync() returns to develop and pulls.
 */
export class LibraryRepo {
    readonly path: string;
    private readonly exec: Exec;
    private readonly gh: string[];

    constructor(options: LibraryRepoOptions) {
        this.path = resolve(options.path);
        this.exec = options.exec ?? run;
        this.gh = options.gh ?? ["gh"];
    }

    get exists(): boolean {
        return existsSync(join(this.path, ".git"));
    }

    private git(...args: string[]) {
        return this.exec(["git", ...args], this.path);
    }

    private ghRun(...args: string[]) {
        return this.exec([...this.gh, ...args], this.exists ? this.path : undefined);
    }

    private async must(result: Promise<Result>, doing: string): Promise<string> {
        const done = await result;
        if (!done.ok) throw new LibraryError(`${doing}: ${done.err || done.out || "failed"}`);
        return done.out;
    }

    /* Clones the repository, or creates it (private) when GitHub has no such repository yet, and leaves it on develop. */
    async connect(repo: string): Promise<void> {
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new LibraryError(`${repo} is not owner/name`);
        if (!this.exists) {
            await this.must(this.ghRun("auth", "status"), "GitHub CLI is not signed in");
            mkdirSync(dirname(this.path), { recursive: true });
            if ((await this.ghRun("repo", "view", repo, "--json", "name")).ok) {
                await this.must(this.ghRun("repo", "clone", repo, this.path), "Could not clone the library");
            } else {
                await this.must(this.ghRun("repo", "create", repo, "--private", "--description", "Dyarchia library"), "Could not create the library");
                await this.must(this.ghRun("repo", "clone", repo, this.path), "Could not clone the new library");
            }
        }
        if (!(await this.git("rev-parse", "--verify", "--quiet", "HEAD")).ok) await this.seed();
        await this.ensureDevelop();
    }

    private async seed() {
        writeFileSync(join(this.path, "README.md"), "# Library\n\nPieces built with Dyarchia: skills, agents, prompts, commands, rules, hooks, plugins and mods.\n");
        for (const folder of folders) {
            mkdirSync(join(this.path, folder), { recursive: true });
            writeFileSync(join(this.path, folder, ".gitkeep"), "");
        }
        const branch = (await this.git("symbolic-ref", "--short", "HEAD")).out || "main";
        await this.must(this.git("add", "-A"), "Could not stage the layout");
        await this.must(this.git("commit", "-m", "Library layout"), "Could not commit the layout");
        await this.must(this.git("push", "-u", "origin", branch), "Could not push the layout");
    }

    private async ensureDevelop() {
        const local = (await this.git("rev-parse", "--verify", "--quiet", "refs/heads/develop")).ok;
        const remote = (await this.git("rev-parse", "--verify", "--quiet", "refs/remotes/origin/develop")).ok;
        if (!local && remote) await this.must(this.git("branch", "--track", "develop", "origin/develop"), "Could not track develop");
        if (!local && !remote) {
            await this.must(this.git("branch", "develop"), "Could not create develop");
            await this.must(this.git("push", "-u", "origin", "develop"), "Could not push develop");
        }
        if ((await this.git("branch", "--show-current")).out !== "develop" && (await this.changes()).length === 0) await this.git("switch", "develop");
    }

    async changes(): Promise<Change[]> {
        const out = (await this.git("status", "--porcelain", "-uall")).out;
        return out
            .split("\n")
            .filter(Boolean)
            .map((line) => {
                const code = line.slice(0, 2);
                const path = line.slice(3).replace(/^"|"$/g, "");
                return { path, status: code.includes("D") ? "deleted" : code.includes("?") || code.includes("A") ? "added" : "modified" };
            });
    }

    async status(): Promise<RepoStatus> {
        if (!this.exists) throw new LibraryError("The library is not connected");
        const branch = (await this.git("branch", "--show-current")).out;
        const remote = (await this.git("remote", "get-url", "origin")).out || null;
        return { path: this.path, remote, branch, base: "develop", changes: await this.changes(), pr: branch === "develop" ? null : await this.pullRequest(branch) };
    }

    private async pullRequest(branch: string): Promise<PullRequest | null> {
        const view = await this.ghRun("pr", "view", branch, "--json", "url,state");
        if (!view.ok) return null;
        const pr = JSON.parse(view.out) as PullRequest;
        return { url: pr.url, state: pr.state };
    }

    async publish(message: string): Promise<PullRequest> {
        const title = message.trim();
        if (!title) throw new LibraryError("Describe the change before publishing it");
        if ((await this.changes()).length === 0) throw new LibraryError("There is nothing to publish");
        let branch = (await this.git("branch", "--show-current")).out;
        if (branch === "develop") {
            branch = `feature/build-${slug(title)}`;
            if ((await this.git("rev-parse", "--verify", "--quiet", `refs/heads/${branch}`)).ok) branch = `${branch}-${Date.now().toString(36)}`;
            await this.must(this.git("switch", "-c", branch), "Could not start the feature branch");
        }
        await this.must(this.git("add", "-A"), "Could not stage the changes");
        await this.must(this.git("commit", "-m", title), "Could not commit");
        await this.must(this.git("push", "-u", "origin", branch), "Could not push");
        const open = await this.pullRequest(branch);
        if (open?.state === "OPEN") return open;
        await this.must(
            this.ghRun("pr", "create", "--base", "develop", "--head", branch, "--title", title, "--body", "Published from Dyarchia Build."),
            "Could not open the pull request",
        );
        const created = await this.pullRequest(branch);
        if (!created) throw new LibraryError("The pull request was opened but cannot be read back");
        return created;
    }

    /* After the user merges the pull request: back to develop with the merged pieces. */
    async sync(): Promise<RepoStatus> {
        const branch = (await this.git("branch", "--show-current")).out;
        if (branch !== "develop") {
            const pr = await this.pullRequest(branch);
            if (pr?.state === "OPEN") throw new LibraryError("The pull request is still open; merge it on GitHub first");
            if ((await this.changes()).length > 0) throw new LibraryError("Publish or discard the changes on this branch first");
            await this.must(this.git("switch", "develop"), "Could not return to develop");
            if (pr?.state === "MERGED") await this.git("branch", "-D", branch);
        }
        await this.must(this.git("pull", "--ff-only", "origin", "develop"), "Could not pull develop");
        return this.status();
    }

    private inside(path: string) {
        const full = resolve(this.path, path);
        const rel = relative(this.path, full);
        if (!rel || rel.startsWith("..") || rel.split(sep)[0] === ".git") throw new LibraryError(`${path} is outside the library`);
        return full;
    }

    read(path: string): string {
        const full = this.inside(path);
        if (!existsSync(full)) throw new LibraryError(`${path} does not exist`);
        return readFileSync(full, "utf8");
    }

    write(path: string, text: string): void {
        const full = this.inside(path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, text);
    }

    remove(path: string): void {
        const full = this.inside(path);
        rmSync(full, { recursive: true, force: true });
        const parent = dirname(full);
        if (parent !== this.path && existsSync(parent) && readdirSync(parent).length === 0 && !folders.some((folder) => join(this.path, folder) === parent)) rmSync(parent, { recursive: true });
    }

    /* Every file under the piece folders, relative to the library root, with forward slashes. */
    files(): string[] {
        const found: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir)) {
                const full = join(dir, entry);
                if (statSync(full).isDirectory()) walk(full);
                else if (entry !== ".gitkeep") found.push(relative(this.path, full).split(sep).join("/"));
            }
        };
        for (const folder of folders) if (existsSync(join(this.path, folder))) walk(join(this.path, folder));
        return found.sort();
    }
}
