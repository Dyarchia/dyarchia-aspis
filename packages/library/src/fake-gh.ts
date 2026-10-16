/*
 * Stands in for the GitHub CLI in tests. "GitHub" is a folder of bare repositories (FAKE_GH_REMOTES, one
 * owner__name.git per repository) and pull requests are JSON files in FAKE_GH_PRS. Only the calls the library
 * makes are answered: auth status, repo view, repo create, repo clone, pr view and pr create. Unit tests call
 * fakeGh() in process through their Exec, so no bun process starts per call; e2e runs this file as the gh command.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Result } from "./repo.ts";

export async function fakeGh(args: string[], env: Record<string, string | undefined>): Promise<Result> {
    const [group, verb, ...rest] = args;
    const bare = (repo: string) => join(env.FAKE_GH_REMOTES!, `${repo.replace("/", "__")}.git`);
    const prFile = (branch: string) => join(env.FAKE_GH_PRS!, `${branch.replace(/\//g, "__")}.json`);
    const answer = (ok: boolean, out = "", err = "") => ({ ok, out, err });
    const git = async (...command: string[]) => {
        const proc = Bun.spawn(["git", ...command], { env, stdout: "ignore", stderr: "pipe", windowsHide: true });
        const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
        return answer(code === 0, "", err.trim());
    };

    if (group === "auth" && verb === "status") return answer(!env.FAKE_GH_SIGNED_OUT);
    if (group === "repo" && verb === "view") return existsSync(bare(rest[0]!)) ? answer(true, JSON.stringify({ name: rest[0]!.split("/")[1] })) : answer(false);
    if (group === "repo" && verb === "create") return git("init", "-q", "--bare", "-b", "main", bare(rest[0]!));
    if (group === "repo" && verb === "clone") return git("clone", "-q", bare(rest[0]!), rest[1]!);
    if (group === "pr" && verb === "view") return existsSync(prFile(rest[0]!)) ? answer(true, readFileSync(prFile(rest[0]!), "utf8")) : answer(false);
    if (group === "pr" && verb === "create") {
        mkdirSync(env.FAKE_GH_PRS!, { recursive: true });
        const head = rest[rest.indexOf("--head") + 1]!;
        const url = `https://github.com/owner/library/pull/${readdirSync(env.FAKE_GH_PRS!).length + 1}`;
        writeFileSync(prFile(head), JSON.stringify({ url, state: "OPEN" }));
        return answer(true, url);
    }
    return answer(false, "", `fake gh does not answer: ${args.join(" ")}`);
}

if (import.meta.main) {
    const { ok, out, err } = await fakeGh(process.argv.slice(2), process.env);
    if (out) console.log(out);
    if (!ok && err) console.error(err);
    process.exit(ok ? 0 : 1);
}
