import { afterAll, beforeAll } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
 * A closed bun:sqlite database keeps its file open on Windows until its statements are collected, and a collection
 * made while the test that used them is still on the stack can miss them however often it is retried. So a test
 * file gets one root folder, each test a fresh folder inside it, and the root goes once every test has finished.
 */
export function tempFolders(prefix: string): () => string {
    let root: string;
    beforeAll(() => {
        root = mkdtempSync(join(tmpdir(), prefix));
    });
    afterAll(async () => {
        for (let attempt = 0; ; attempt++) {
            Bun.gc(true);
            try {
                rmSync(root, { recursive: true, force: true });
                return;
            } catch (error) {
                if (attempt >= 20) throw error;
                await Bun.sleep(50);
            }
        }
    });
    return () => mkdtempSync(join(root, "test-"));
}
