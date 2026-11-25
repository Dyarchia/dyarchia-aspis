import { type Page, expect, test } from "@playwright/test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { accessible, api, headers, live, project, saysEverythingOnce, useTheme } from "./support/audit.ts";

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Primary" });
const folder = () => join(process.env.ASPIS_E2E_HOME!, "repos", "ivirma-crm");

async function openProjects(page: Page) {
    await page.request.put(`${api}/settings`, { headers, data: { theme: "dark", console: "git-bash" } });
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    await live(page);
    await page.keyboard.press("p");
}

test.beforeAll(async ({ request }) => void (await project(request)));

test.afterEach(async ({ request }) => {
    const sessions = (await (await request.get(`${api}/terminals`, { headers })).json()) as { id: string }[];
    for (const session of sessions) await request.delete(`${api}/terminals/${session.id}`, { headers });
});

/*
 * The session is a real console, so the test has it write a file and reads the file back: that proves the keys
 * reached the shell, and that the shell started in the project's folder.
 */
test("a + on a project opens a real console in its folder, which outlives leaving the view, and closing it ends it", async ({ page }) => {
    await openProjects(page);
    await expect(page.getByText("Open a session with + on a project")).toBeVisible();
    await sidebar(page).getByRole("button", { name: "ivirma-crm", exact: true }).hover();
    await sidebar(page).getByRole("button", { name: "New session in ivirma-crm" }).click();
    await expect(page.locator(".aspis-terminal .xterm")).toBeVisible();
    await expect(sidebar(page).getByRole("button", { name: "Session 1" })).toHaveAttribute("aria-current", "page");

    const proof = join(folder(), "where.txt");
    rmSync(proof, { force: true });
    await page.locator(".aspis-terminal .xterm").click();
    await page.keyboard.type("pwd > where.txt");
    await page.keyboard.press("Enter");
    await expect.poll(() => existsSync(proof) && readFileSync(proof, "utf8"), { timeout: 20_000 }).toContain("ivirma-crm");
    rmSync(proof, { force: true });

    await page.keyboard.press("Escape");
    await page.reload();
    await live(page);
    await sidebar(page).getByRole("button", { name: "ivirma-crm 1", exact: true }).click();
    await expect(sidebar(page).getByRole("button", { name: "Session 1" })).toBeVisible();

    await sidebar(page).getByRole("button", { name: "Session 1" }).click();
    await sidebar(page).getByRole("button", { name: "New session in ivirma-crm" }).click();
    await expect(sidebar(page).getByRole("button", { name: "Session 2" })).toHaveAttribute("aria-current", "page");
    await saysEverythingOnce(page);
    await accessible(page);
    await page.getByRole("button", { name: "Close Session 2" }).click();
    await expect(sidebar(page).getByRole("button", { name: "Session 2" })).toHaveCount(0);
    await expect(sidebar(page).getByRole("button", { name: "Session 1" })).toBeVisible();
    await expect.poll(async () => ((await (await page.request.get(`${api}/terminals`, { headers })).json()) as unknown[]).length).toBe(1);
});

test("Settings offers the consoles this machine has", async ({ page }) => {
    await openProjects(page);
    await page.keyboard.press("s");
    const console = page.getByRole("combobox", { name: "Console" });
    await expect(console).toHaveValue("git-bash");
    await expect(console.locator("option")).toContainText(process.platform === "win32" ? ["Git Bash", "PowerShell", "Command Prompt"] : ["Bash"]);
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
