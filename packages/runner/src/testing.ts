import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./git.ts";

export const fakeClaude = join(import.meta.dir, "fake-claude.ts");

/* A repository on develop with one commit and its own identity, so commits work where git has no global one. */
export async function makeRepo(path: string) {
    mkdirSync(path, { recursive: true });
    await git(path, "init", "-q", "-b", "develop");
    await git(path, "config", "user.name", "Aspis Test");
    await git(path, "config", "user.email", "test@aspis.local");
    writeFileSync(join(path, "README.md"), "# repo\n");
    await git(path, "add", "-A");
    await git(path, "commit", "-q", "-m", "init");
}
