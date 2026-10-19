import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeGh } from "./fake-gh.ts";
import { type Exec, LibraryRepo } from "./repo.ts";

type Env = Record<string, string | undefined>;

const identity = { GIT_AUTHOR_NAME: "Aspis Test", GIT_AUTHOR_EMAIL: "test@aspis.local", GIT_COMMITTER_NAME: "Aspis Test", GIT_COMMITTER_EMAIL: "test@aspis.local" };
const github = (root: string): Env => ({ ...process.env, ...identity, FAKE_GH_REMOTES: join(root, "github"), FAKE_GH_PRS: join(root, "prs") });
const execWith =
    (env: Env): Exec =>
    async (command, cwd) => {
        if (command[0] === "gh") return fakeGh(command.slice(1), env);
        const proc = Bun.spawn(command, { cwd, env, stdout: "pipe", stderr: "pipe", windowsHide: true });
        const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
        return { ok: code === 0, out: out.trim(), err: err.trim() };
    };

let seeded: string;
let dir: string;
let env: Env;
let exec: Exec;

/*
 * Creating a library on GitHub (seed commit, two pushes) is covered once by its own test. The other tests start
 * from a copy of the bare repository that creation leaves, so they take the clone path without paying for it again.
 */
beforeAll(async () => {
    seeded = mkdtempSync(join(tmpdir(), "aspis-library-seed-"));
    mkdirSync(join(seeded, "github"));
    await new LibraryRepo({ path: join(seeded, "clone"), exec: execWith(github(seeded)) }).connect("owner/mantinea");
});

afterAll(() => rmSync(seeded, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aspis-library-"));
    env = github(dir);
    mkdirSync(join(dir, "github"));
    exec = execWith(env);
});

afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));

const library = (name = "mantinea") => new LibraryRepo({ path: join(dir, "clones", name), exec });
const onGitHub = () => cpSync(join(seeded, "github", "owner__mantinea.git"), join(dir, "github", "owner__mantinea.git"), { recursive: true });
const git = async (repo: LibraryRepo, ...args: string[]) => (await exec(["git", ...args], repo.path)).out;
const merge = async (repo: LibraryRepo, branch: string) => {
    await exec(["git", "push", "-q", "origin", `${branch}:develop`], repo.path);
    const file = join(dir, "prs", `${branch.replace(/\//g, "__")}.json`);
    writeFileSync(file, (await Bun.file(file).text()).replace('"OPEN"', '"MERGED"'));
};

test("connecting to a repository GitHub does not have creates it with the layout and a develop branch", async () => {
    const repo = library();
    await repo.connect("owner/mantinea");
    expect(existsSync(join(repo.path, "skills", ".gitkeep"))).toBe(true);
    expect(await repo.status()).toMatchObject({ branch: "develop", base: "develop", changes: [], pr: null });
    expect(await git(repo, "ls-remote", "--heads", "origin")).toContain("refs/heads/develop");
});

test("connecting to an existing repository clones it", async () => {
    onGitHub();
    const repo = library();
    await repo.connect("owner/mantinea");
    expect((await repo.status()).branch).toBe("develop");
    expect(repo.files()).toEqual([]);
});

test("a signed-out GitHub CLI is reported before anything is created", async () => {
    env.FAKE_GH_SIGNED_OUT = "1";
    await expect(library().connect("owner/mantinea")).rejects.toThrow("not signed in");
});

test("publishing moves the changes to a feature branch with a pull request, and later publishes join it", async () => {
    onGitHub();
    const repo = library();
    await repo.connect("owner/mantinea");
    repo.write("skills/apex-review/SKILL.md", "---\nname: apex-review\ndescription: Review Apex\n---\nReview it.\n");
    expect((await repo.status()).changes).toEqual([{ path: "skills/apex-review/SKILL.md", status: "added" }]);
    expect(repo.files()).toEqual(["skills/apex-review/SKILL.md"]);

    const pr = await repo.publish("Add the apex-review skill");
    expect(pr).toEqual({ url: "https://github.com/owner/library/pull/1", state: "OPEN" });
    expect(await repo.status()).toMatchObject({ branch: "feature/build-add-the-apex-review-skill", changes: [], pr: { state: "OPEN" } });
    expect(await git(repo, "log", "-1", "--format=%s", "develop")).toBe("Library layout");

    repo.write("skills/apex-review/SKILL.md", "---\nname: apex-review\ndescription: Review Apex classes\n---\nReview it.\n");
    expect((await repo.publish("Sharpen the description")).url).toBe(pr.url);
    expect(await git(repo, "rev-list", "--count", "develop..HEAD")).toBe("2");
    await expect(repo.sync()).rejects.toThrow("still open");

    await merge(repo, "feature/build-add-the-apex-review-skill");
    expect(await repo.sync()).toMatchObject({ branch: "develop", changes: [], pr: null });
    expect(repo.read("skills/apex-review/SKILL.md")).toContain("Review Apex classes");
    expect(await git(repo, "branch", "--list", "feature/*")).toBe("");
}, 20_000);

test("nothing outside the piece folders can be read or written", async () => {
    onGitHub();
    const repo = library();
    await repo.connect("owner/mantinea");
    expect(() => repo.read("../outside.txt")).toThrow("outside the library");
    expect(() => repo.write(".git/config", "x")).toThrow("outside the library");
    await expect(repo.publish("Nothing")).rejects.toThrow("nothing to publish");
});
