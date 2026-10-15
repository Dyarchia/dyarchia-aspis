import { type Page, expect, test } from "@playwright/test";
import { type ThemeName, accessible, api, headers, live, sameLayout, useTheme } from "./support/audit.ts";

const themes = ["io", "nyx"] as const;
const views = [
    { key: "h", name: "home" },
    { key: "s", name: "settings" },
    { key: "k", name: "kanban" },
    { key: "b", name: "build" },
] as const;
const windows = [
    { width: 1440, height: 900 },
    { width: 1024, height: 640 },
];
const sections = ["Theme", "Updates", "Scheduled runs", "Agent CLIs", "Library", "Keyboard", "About"];

/*
 * Settings shows facts about the machine it runs on: whether each agent CLI is installed and where state.db lives.
 * Both differ between this PC and the CI runner, so the CLIs are answered with one fixed status and the path is
 * masked in the screenshot.
 */
const agents = { installable: false, agents: ["claude-code", "kimi-code"].map((harness) => ({ harness, cli: true, installed: false })) };
const machine = (page: Page) => [page.locator(".aspis-meta__item", { hasText: "State" }).locator(".aspis-meta__value")];

async function open(page: Page, theme: ThemeName) {
    await page.route(`${api}/agents`, (route) => route.fulfill({ json: agents }));
    await page.request.put(`${api}/settings`, { headers, data: { theme } });
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    await live(page);
    await useTheme(page, theme);
}

const fits = (page: Page) =>
    expect
        .poll(() => page.locator(".aspis-shell__main").evaluate((main) => main.scrollHeight - main.clientHeight + (document.documentElement.scrollHeight - innerHeight)))
        .toBeLessThanOrEqual(0);

const section = (page: Page, name: string) => page.getByRole("list", { name: "Sections" }).getByRole("button", { name, exact: true });

for (const view of views) {
    test(`${view.name} is one layout in both themes`, async ({ page }) => {
        await open(page, "io");
        await page.keyboard.press(view.key);
        await sameLayout(page, async () => {});
    });

    test(`${view.name} fits the window without scrolling`, async ({ page }) => {
        await open(page, "io");
        await page.keyboard.press(view.key);
        for (const size of windows) {
            await page.setViewportSize(size);
            await fits(page);
        }
    });

    for (const theme of themes) {
        test(`${view.name} in ${theme}`, async ({ page }) => {
            await open(page, theme);
            await page.keyboard.press(view.key);
            await page.mouse.move(0, 0);
            await expect(page).toHaveScreenshot(`${view.name}-${theme}.png`, { mask: machine(page) });
            await accessible(page);
        });
    }
}

test("every settings section fits the smallest window and is accessible", async ({ page }) => {
    await open(page, "io");
    await page.keyboard.press("s");
    await page.setViewportSize(windows[1]!);
    for (const name of sections) {
        await section(page, name).click();
        await expect(section(page, name)).toHaveAttribute("aria-current", "true");
        await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
        await fits(page);
        await accessible(page);
    }
});

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
    const { id } = await (await page.request.post(`${api}/cards`, { headers, data: { title: "Palette over a panel" } })).json();
    await open(page, "io");
    await page.keyboard.press("k");
    const tile = page.getByRole("button", { name: "Palette over a panel" });
    await tile.click();
    const panel = page.getByRole("dialog", { name: `#${id} Palette over a panel` });
    await expect(panel).toBeVisible();
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("combobox", { name: "Command" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox", { name: "Command" })).toHaveCount(0);
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(tile).toBeFocused();
    await page.request.delete(`${api}/cards/${id}`, { headers });
});

test("single-key shortcuts can be switched off", async ({ page }) => {
    await open(page, "io");
    await page.keyboard.press("s");
    await section(page, "Keyboard").click();
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
