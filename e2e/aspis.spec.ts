import { type Page, expect, test } from "@playwright/test";
import { type ThemeName, accessible, api, headers, live, project, sameLayout, saysEverythingOnce, startOnOneLine, useTheme } from "./support/audit.ts";

const themes = ["io", "nyx"] as const;
const views = [
    { key: "h", name: "home", panes: [] },
    { key: "k", name: "kanban", panes: [".aspis-page__bar .aspis-field__input"] },
    { key: "b", name: "build", panes: [] },
] as const;

/*
 * The smallest window the app allows, a common laptop, and the maximized window on the user's 3440x1440 monitor.
 */
const windows = [
    { width: 1024, height: 640 },
    { width: 1440, height: 900 },
    { width: 3440, height: 1369 },
];

/*
 * Settings shows facts about the machine it runs on: whether each agent CLI is installed, where state.db lives and
 * when the dispatcher last ran. They differ between this PC and the CI runner, and a longer path or one more line
 * would change the dialog's height, so both answers are fixed here.
 */
const agents = { installable: false, agents: ["claude-code", "kimi-code"].map((harness) => ({ harness, cli: true, installed: false })) };

async function open(page: Page, theme: ThemeName) {
    await page.route(`${api}/agents`, (route) => route.fulfill({ json: agents }));
    await page.route(`${api}/health`, async (route) => route.fulfill({ json: { ...(await (await route.fetch()).json()), dbPath: "C:/Users/you/.dyarchia-aspis/state.db", lastDispatch: null } }));
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

const settings = (page: Page) => page.getByRole("dialog", { name: "Settings" });

test.beforeAll(async ({ request }) => void (await project(request)));

for (const view of views) {
    test(`${view.name} is one layout in both themes`, async ({ page }) => {
        await open(page, "io");
        await page.keyboard.press(view.key);
        await sameLayout(page, async () => {});
    });

    test(`${view.name} fits every window, says everything once and starts on one line`, async ({ page }) => {
        await open(page, "io");
        await page.keyboard.press(view.key);
        for (const size of windows) {
            await page.setViewportSize(size);
            await fits(page);
            await saysEverythingOnce(page);
            await startOnOneLine(page, [...view.panes]);
        }
    });

    for (const theme of themes) {
        test(`${view.name} in ${theme}`, async ({ page }) => {
            await open(page, theme);
            await page.keyboard.press(view.key);
            await page.mouse.move(0, 0);
            await expect(page).toHaveScreenshot(`${view.name}-${theme}.png`);
            await accessible(page);
        });
    }
}

for (const theme of themes) {
    test(`settings in ${theme}`, async ({ page }) => {
        await open(page, theme);
        await page.getByRole("button", { name: "Settings" }).click();
        await expect(settings(page)).toBeVisible();
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot(`settings-${theme}.png`);
        await accessible(page);
        await saysEverythingOnce(page);
    });
}

test("settings fits the smallest window, and Escape gives focus back to the gear", async ({ page }) => {
    await open(page, "io");
    await page.setViewportSize(windows[0]!);
    const gear = page.getByRole("button", { name: "Settings" });
    await gear.click();
    const box = settings(page).locator(".aspis-dialog__box");
    await expect(box).toBeVisible();
    expect(await box.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(windows[0]!.height);
    await page.keyboard.press("Escape");
    await expect(settings(page)).toHaveCount(0);
    await expect(gear).toBeFocused();
});

test("the theme is one switch in Settings", async ({ page }) => {
    await open(page, "io");
    await page.keyboard.press("s");
    const nyx = settings(page).getByRole("switch", { name: "nyx" });
    await expect(nyx).toHaveAttribute("aria-checked", "false");
    await nyx.click();
    await expect(page.locator('html[data-theme="nyx"]')).toBeAttached();
    await nyx.click();
    await expect(page.locator('html[data-theme="io"]')).toBeAttached();
});

for (const theme of themes) {
    test(`command palette in ${theme}`, async ({ page }) => {
        await open(page, theme);
        await page.keyboard.press("Control+k");
        await expect(page.getByRole("option", { name: /Go to Home/ })).toHaveCount(0);
        await expect(page.getByRole("option", { name: `Use the ${theme} theme` })).toHaveCount(0);
        await page.keyboard.type("set");
        await expect(page.getByRole("option", { name: /Open Settings/ })).toHaveAttribute("aria-selected", "true");
        await expect(page).toHaveScreenshot(`palette-${theme}.png`);
        await accessible(page);
        await page.keyboard.press("Enter");
        await expect(settings(page)).toBeVisible();
    });
}

test("the palette stacks over a dialog, and Escape closes only the palette", async ({ page }) => {
    const { id } = await (await page.request.post(`${api}/cards`, { headers, data: { title: "Palette over a panel", board: await project(page.request) } })).json();
    await open(page, "io");
    await page.keyboard.press("k");
    await page.getByRole("combobox", { name: "Board" }).selectOption({ label: "ivirma-crm" });
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
    const shortcuts = settings(page).getByRole("switch", { name: "Single-key shortcuts" });
    await page.keyboard.press("s");
    await shortcuts.click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("k");
    await expect(page.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Settings" }).click();
    await shortcuts.click();
    await expect(shortcuts).toHaveAttribute("aria-checked", "true");
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
