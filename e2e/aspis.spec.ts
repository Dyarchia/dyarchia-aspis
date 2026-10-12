import { type Page, expect, test } from "@playwright/test";

const api = "http://127.0.0.1:4319";
const auth = { authorization: "Bearer dev", "content-type": "application/json" };
const themes = ["io", "nyx"] as const;
const views = [
    { key: "h", name: "home" },
    { key: "a", name: "aspis" },
    { key: "s", name: "settings" },
    { key: "k", name: "kanban" },
] as const;

async function open(page: Page, theme: (typeof themes)[number]) {
    await page.request.put(`${api}/settings`, { headers: auth, data: { theme } });
    await page.clock.install();
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    await expect(page.locator(`html[data-theme="${theme}"]`)).toBeAttached();
    await expect(page.getByText(/server live/i)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
}

for (const theme of themes) {
    for (const view of views) {
        test(`${view.name} in ${theme}`, async ({ page }) => {
            await open(page, theme);
            await page.keyboard.press(view.key);
            await page.mouse.move(0, 0);
            await expect(page).toHaveScreenshot(`${view.name}-${theme}.png`, { fullPage: true });
        });
    }

    test(`command palette in ${theme}`, async ({ page }) => {
        await open(page, theme);
        await page.keyboard.press("Control+k");
        await page.keyboard.type("set");
        await expect(page.getByRole("option", { name: /Go to Settings/ })).toHaveAttribute("aria-selected", "true");
        await expect(page).toHaveScreenshot(`palette-${theme}.png`);
        await page.keyboard.press("Enter");
        await expect(page.getByRole("heading", { level: 1, name: /Settings/ })).toBeVisible();
    });
}

test("theme hotkey persists in state.db and every client follows", async ({ page, browser }) => {
    await open(page, "io");
    const other = await browser.newPage();
    await other.goto("/");
    await expect(other.locator('html[data-theme="io"]')).toBeAttached();
    await expect(other.getByText(/server live/i)).toBeVisible();

    await page.keyboard.press("t");
    await expect(page.locator('html[data-theme="nyx"]')).toBeAttached();
    await expect(other.locator('html[data-theme="nyx"]')).toBeAttached();
    const settings = await (await page.request.get(`${api}/settings`, { headers: auth })).json();
    expect(settings.theme).toBe("nyx");
    await other.close();
});
