import { type Page, expect, test } from "@playwright/test";
import { type ThemeName, accessible, api, headers, live, sameLayout, useTheme } from "./support/audit.ts";

const themes = ["io", "nyx"] as const;
const views = [
    { key: "h", name: "home" },
    { key: "a", name: "aspis" },
    { key: "s", name: "settings" },
    { key: "k", name: "kanban" },
    { key: "b", name: "build" },
] as const;

async function open(page: Page, theme: ThemeName) {
    await page.request.put(`${api}/settings`, { headers, data: { theme } });
    await page.clock.install();
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    await live(page);
    await useTheme(page, theme);
}

const fit = async (page: Page) => {
    const height = await page.locator(".aspis-shell__main").evaluate((main) => main.scrollHeight);
    await page.setViewportSize({ width: 1440, height: Math.max(900, height) });
};

for (const view of views) {
    test(`${view.name} is one layout in both themes`, async ({ page }) => {
        await open(page, "io");
        await page.keyboard.press(view.key);
        await page.clock.pauseAt(Date.now() + 60_000);
        await fit(page);
        await sameLayout(page, async () => {});
    });

    for (const theme of themes) {
        test(`${view.name} in ${theme}`, async ({ page }) => {
            await open(page, theme);
            await page.keyboard.press(view.key);
            await page.clock.pauseAt(Date.now() + 60_000);
            await page.mouse.move(0, 0);
            await fit(page);
            await expect(page).toHaveScreenshot(`${view.name}-${theme}.png`, { timeout: 20_000 });
            await page.clock.resume();
            await accessible(page, view.name === "aspis" ? ['[data-drop="refused"]'] : []);
        });
    }
}

for (const theme of themes) {
    test(`command palette in ${theme}`, async ({ page }) => {
        await open(page, theme);
        await page.keyboard.press("Control+k");
        await page.keyboard.type("set");
        await expect(page.getByRole("option", { name: /Go to Settings/ })).toHaveAttribute("aria-selected", "true");
        await expect(page).toHaveScreenshot(`palette-${theme}.png`);
        await accessible(page);
        await page.keyboard.press("Enter");
        await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeFocused();
    });
}

test("the palette stacks over a dialog, and Escape closes only the palette", async ({ page }) => {
    await open(page, "io");
    await page.keyboard.press("a");
    await page.getByRole("button", { name: "Open card panel" }).click();
    const panel = page.getByRole("dialog", { name: "#7 Archive stale Quote fields" });
    await expect(panel).toBeVisible();
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("combobox", { name: "Command" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox", { name: "Command" })).toHaveCount(0);
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open card panel" })).toBeFocused();
});

test("single-key shortcuts can be switched off", async ({ page }) => {
    await open(page, "io");
    await page.keyboard.press("s");
    await page.getByRole("switch", { name: "Single-key shortcuts" }).click();
    await page.locator("body").click({ position: { x: 600, y: 10 } });
    await page.keyboard.press("k");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await page.getByRole("switch", { name: "Single-key shortcuts" }).click();
});

test("theme hotkey persists in state.db and every client follows", async ({ page, browser }) => {
    await open(page, "io");
    const other = await browser.newPage();
    await other.goto("/");
    await expect(other.locator('html[data-theme="io"]')).toBeAttached();
    await live(other);

    await page.keyboard.press("t");
    await expect(page.locator('html[data-theme="nyx"]')).toBeAttached();
    await expect(other.locator('html[data-theme="nyx"]')).toBeAttached();
    const settings = await (await page.request.get(`${api}/settings`, { headers })).json();
    expect(settings.theme).toBe("nyx");
    await other.close();
});
