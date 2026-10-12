import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/*
 * Launches the installed app with WebView2 remote debugging, captures its window in the current theme and in the
 * other one (pressing T twice leaves state.db as it was), then closes the app.
 * Usage: node scripts/snap-installed.ts <output prefix> [view hotkey]
 */
const port = 9333;
const prefix = process.argv[2] ?? "installed";
const view = process.argv[3];
const exe = join(process.env.LOCALAPPDATA!, "Dyarchia Aspis", "dyarchia-aspis.exe");
const app = spawn(exe, [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
    detached: true,
    stdio: "ignore",
});

let browser;
for (let attempt = 0; attempt < 40 && !browser; attempt++) {
    await sleep(500);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => undefined);
}
if (!browser) throw new Error("WebView2 never exposed CDP");
const page = browser.contexts()[0]!.pages()[0]!;
await page.getByText(/server live/i).waitFor();
if (view) await page.keyboard.press(view);
for (const step of [1, 2]) {
    await sleep(800);
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.screenshot({ path: `${prefix}-${step}-${theme}.png` });
    console.log(`${prefix}-${step}-${theme}.png`);
    await page.keyboard.press("t");
}
await sleep(500);
await browser.close();
process.kill(app.pid!);
