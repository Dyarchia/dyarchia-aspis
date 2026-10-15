import { type Page, chromium } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/*
 * Launches the installed app with WebView2 remote debugging, maximizes its window, walks every view and state in
 * the current theme and in the other one (pressing T twice leaves state.db as it was), then closes the app. The
 * tour only reads: it opens a card and a piece but never saves, publishes, moves or creates anything.
 * Usage: node scripts/snap-installed.ts <output prefix>
 */
const port = 9333;
const prefix = process.argv[2] ?? "installed";
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
await page.locator('.aspis-shell[data-state="live"]').waitFor({ state: "attached" });

execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c);'; [W.U]::ShowWindow((Get-Process -Id ${app.pid}).MainWindowHandle, 3)`,
]);

const calm = async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(0, 0);
};
const snap = async (step: number, name: string) => {
    await sleep(600);
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    const path = `${prefix}-${step}-${name}-${theme}.png`;
    await page.screenshot({ path });
    console.log(path);
};
const press = async (key: string) => {
    await calm();
    await page.keyboard.press(key);
};
const visible = async (page: Page, selector: string) => (await page.locator(selector).count()) > 0 && page.locator(selector).first().isVisible();

async function tour(step: number) {
    await press("h");
    await snap(step, "home");
    await press("k");
    await snap(step, "kanban");
    if (await visible(page, ".aspis-tile")) {
        await page.locator(".aspis-tile").first().click();
        await snap(step, "card");
        await page.keyboard.press("Escape");
    }
    await press("b");
    await snap(step, "build");
    const pieces = page.getByRole("list").nth(2).locator(".aspis-menu__item");
    if ((await pieces.count()) > 0) {
        await pieces.first().click();
        for (const mode of ["Tutorial", "Form", "Code"]) {
            await page.getByRole("tab", { name: mode, exact: true }).click();
            await snap(step, `piece-${mode.toLowerCase()}`);
        }
        await page.getByRole("tab", { name: "Form", exact: true }).click();
    }
    await press("s");
    await snap(step, "settings");
    await page.keyboard.press("Escape");
    await press("Control+k");
    await snap(step, "palette");
    await page.keyboard.press("Escape");
}

for (const step of [1, 2]) {
    await tour(step);
    await press("t");
}
await press("h");
await sleep(500);
await browser.close();
process.kill(app.pid!);
