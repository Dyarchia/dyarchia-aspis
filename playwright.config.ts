import { defineConfig } from "@playwright/test";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

/*
 * The config is evaluated again inside every worker, so the state directory is a fixed path rather than one
 * derived from a pid, and only the main process wipes it before the dev server starts. Scheduled runs use the
 * fake claude, so they behave the same on a machine without the CLI or a login.
 */
const home = resolve(".e2e-state");
if (!process.env.TEST_WORKER_INDEX) rmSync(home, { recursive: true, force: true });
process.env.ASPIS_E2E_HOME = home;

export default defineConfig({
    testDir: "e2e",
    fullyParallel: false,
    workers: 1,
    reporter: process.env.CI ? "github" : "list",
    snapshotPathTemplate: "{testDir}/__screenshots__/{arg}-{platform}{ext}",
    expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled", caret: "hide" } },
    use: { baseURL: "http://localhost:1420", viewport: { width: 1440, height: 900 }, colorScheme: "dark" },
    webServer: {
        command: "bun run dev:web",
        url: "http://localhost:1420",
        reuseExistingServer: false,
        env: {
            ASPIS_HOME: home,
            ASPIS_CLAUDE: resolve("packages/runner/src/fake-claude.ts"),
        },
    },
});
