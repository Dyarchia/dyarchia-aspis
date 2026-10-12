import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const port = 9333;
const out = process.argv[2] ?? "installed.png";
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
await page.waitForLoadState("networkidle");
await sleep(Number(process.env.SNAP_WAIT ?? 1500));
await page.screenshot({ path: out });
console.log(await page.evaluate(() => document.body.innerText.slice(0, 600)));
await browser.close();
process.kill(app.pid!);
