import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
        env: { ASPIS_HOME: join(tmpdir(), `aspis-e2e-${process.pid}`) },
    },
});
