import { type Page, expect, test } from "@playwright/test";
import { accessible, api, headers, live, project, saysEverythingOnce, useTheme } from "./support/audit.ts";

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Primary" });

async function openProjects(page: Page) {
    await page.request.put(`${api}/settings`, { headers, data: { theme: "dark" } });
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    await live(page);
    await page.keyboard.press("p");
}

test.beforeAll(async ({ request }) => void (await project(request)));

test("a + on a project opens a terminal session under it, and closing it removes it", async ({ page }) => {
    await openProjects(page);
    await expect(page.getByText("Open a session with + on a project")).toBeVisible();
    await sidebar(page).getByRole("button", { name: "ivirma-crm", exact: true }).hover();
    await sidebar(page).getByRole("button", { name: "New session in ivirma-crm" }).click();
    await expect(page.locator(".aspis-terminal .xterm")).toBeVisible();
    await expect(sidebar(page).getByRole("button", { name: "Session 1" })).toHaveAttribute("aria-current", "page");
    await sidebar(page).getByRole("button", { name: "New session in ivirma-crm" }).click();
    await expect(sidebar(page).getByRole("button", { name: "Session 2" })).toHaveAttribute("aria-current", "page");
    await saysEverythingOnce(page);
    await accessible(page);
    await page.getByRole("button", { name: "Close Session 2" }).click();
    await expect(sidebar(page).getByRole("button", { name: "Session 2" })).toHaveCount(0);
    await expect(sidebar(page).getByRole("button", { name: "Session 1" })).toBeVisible();
});

for (const theme of ["dark", "light"] as const) {
    test(`a session in ${theme}`, async ({ page }) => {
        await openProjects(page);
        await useTheme(page, theme);
        await sidebar(page).getByRole("button", { name: "New session in ivirma-crm" }).click({ force: true });
        await expect(page.locator(".aspis-terminal .xterm")).toBeVisible();
        await page.waitForTimeout(300);
        await expect(page).toHaveScreenshot(`projects-${theme}.png`, { mask: [page.locator(".aspis-terminal")] });
    });
}
