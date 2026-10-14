/*
 * Stands in for the GitHub CLI in tests. "GitHub" is a folder of bare repositories (FAKE_GH_REMOTES, one
 * owner__name.git per repository) and pull requests are JSON files in FAKE_GH_PRS. Only the calls the library
 * makes are answered: auth status, repo view, repo create, repo clone, pr view and pr create.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [group, verb, ...rest] = process.argv.slice(2);
const remotes = process.env.FAKE_GH_REMOTES!;
const prs = process.env.FAKE_GH_PRS!;
const bare = (repo: string) => join(remotes, `${repo.replace("/", "__")}.git`);
const prFile = (branch: string) => join(prs, `${branch.replace(/\//g, "__")}.json`);
const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { stdout: "ignore", stderr: "ignore" }).exitCode;

if (group === "auth" && verb === "status") process.exit(process.env.FAKE_GH_SIGNED_OUT ? 1 : 0);
if (group === "repo" && verb === "view") {
    if (!existsSync(bare(rest[0]!))) process.exit(1);
    console.log(JSON.stringify({ name: rest[0]!.split("/")[1] }));
    process.exit(0);
}
if (group === "repo" && verb === "create") process.exit(git("init", "-q", "--bare", "-b", "main", bare(rest[0]!)));
if (group === "repo" && verb === "clone") process.exit(git("clone", "-q", bare(rest[0]!), rest[1]!));
if (group === "pr" && verb === "view") {
    if (!existsSync(prFile(rest[0]!))) process.exit(1);
    console.log(readFileSync(prFile(rest[0]!), "utf8"));
    process.exit(0);
}
if (group === "pr" && verb === "create") {
    mkdirSync(prs, { recursive: true });
    const head = rest[rest.indexOf("--head") + 1]!;
    const number = readdirSync(prs).length + 1;
    writeFileSync(prFile(head), JSON.stringify({ url: `https://github.com/owner/library/pull/${number}`, state: "OPEN" }));
    console.log(`https://github.com/owner/library/pull/${number}`);
    process.exit(0);
}
console.error(`fake gh does not answer: ${process.argv.slice(2).join(" ")}`);
process.exit(2);
