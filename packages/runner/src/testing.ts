import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./git.ts";

export const fakeClaude = join(import.meta.dir, "fake-claude.ts");

/* A repository on develop with one commit and its own identity, so commits work where git has no global one. */
export async function makeRepo(path: string) {
    mkdirSync(path, { recursive: true });
    await git(path, "init", "-q", "-b", "develop");
    appendFileSync(join(path, ".git", "config"), "[user]\n\tname = Aspis Test\n\temail = test@aspis.local\n");
    writeFileSync(join(path, "README.md"), "# repo\n");
    await git(path, "add", "-A");
    await git(path, "commit", "-q", "-m", "init");
}

/*
 * bun:sqlite finalizes statements on garbage collection, so a closed database can keep its file open for a moment
 * on Windows. Collect and retry until the folder goes.
 */
export async function removeDir(path: string) {
    for (let attempt = 0; ; attempt++) {
        Bun.gc(true);
        try {
            rmSync(path, { recursive: true, force: true });
            return;
        } catch (error) {
            if (attempt >= 40) throw error;
            await Bun.sleep(50);
        }
    }
}
