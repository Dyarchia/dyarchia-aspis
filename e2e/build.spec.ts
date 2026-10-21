import { type Page, expect, test } from "@playwright/test";
import { accessible, live, saysEverythingOnce, startOnOneLine } from "./support/audit.ts";

const api = "http://127.0.0.1:4319";
const headers = { authorization: "Bearer dev", "content-type": "application/json" };

test.describe.configure({ mode: "serial" });

async function openBuild(page: Page, theme: "io" | "nyx" = "io") {
    await page.request.put(`${api}/settings`, { headers, data: { theme } });
    await page.addInitScript(() => localStorage.clear());
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await live(page);
    await page.keyboard.press("b");
}

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Primary" });
const piece = (page: Page, name: string) => sidebar(page).getByRole("button", { name: new RegExp(`^${name}`) });
const field = (page: Page, label: string) => page.locator(".aspis-field").filter({ has: page.getByText(label, { exact: true }) }).locator("input, textarea, select").first();
const panes = [".aspis-stepper, .aspis-card"];

async function create(page: Page, singular: string, name: string) {
    await page.getByRole("main").getByRole("button", { name: `New ${singular}` }).click();
    const prompt = page.locator('.aspis-dialog[data-placement="center"]');
    await prompt.getByRole("textbox").fill(name);
    await prompt.locator(".aspis-dialog__foot button").last().click();
}

test("Build connects its library in place", async ({ page }) => {
    await openBuild(page);
    await page.getByRole("textbox", { name: "Library repository" }).fill("owner/mantinea");
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText("Library owner/mantinea is ready")).toBeVisible();
    await expect(page.getByRole("button", { name: "New skill" }).first()).toBeVisible();
    await expect(sidebar(page).getByRole("button", { name: /^Skills/ })).toHaveAttribute("aria-expanded", "true");
});

test("a skill made in the guide is the file in code, the code drives the form back, and every change saves itself", async ({ page }) => {
    await openBuild(page);
    const prompt = page.locator('.aspis-dialog[data-placement="center"]');
    await page.getByRole("main").getByRole("button", { name: "New skill" }).click();
    await prompt.getByRole("textbox").fill("Apex Review");
    await prompt.locator(".aspis-dialog__foot button").last().click();
    await expect(prompt.getByText("Only lowercase letters, digits and hyphens")).toBeVisible();
    await prompt.getByRole("textbox").fill("apex-review");
    await prompt.locator(".aspis-dialog__foot button").last().click();
    await expect(piece(page, "apex-review")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "What is a skill?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /What is a skill\?/ })).toHaveAttribute("aria-current", "step");

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await field(page, "Description").fill("Use this skill when the user asks to review Apex classes.");
    await expect(page.getByRole("region", { name: "SKILL.md" })).toContainText("description: Use this skill when the user asks to review Apex classes.");

    await page.getByRole("tab", { name: "Code" }).click();
    const code = page.locator(".cm-content");
    await expect(code).toContainText("description: Use this skill when the user asks to review Apex classes.");
    await code.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.insertText("---\nname: apex-reviewer\ndescription: Use this skill when the user asks to review Apex classes.\n---\n\nSteps Claude follows when this skill applies.\n");
    await page.getByRole("tab", { name: "Form" }).click();
    await expect(field(page, "Name")).toHaveValue("apex-reviewer");
    await expect(page.getByText("The command will be /apex-reviewer, not /apex-review")).toBeVisible();
    await expect(piece(page, "apex-review")).toHaveAccessibleName(/Not published/);
    await expect(page.getByRole("button", { name: /^Publish 1$/ })).toBeVisible();

    const stored = async () => (await (await page.request.get(`${api}/library/file?path=skills/apex-review/SKILL.md`, { headers })).json()).text as string;
    await expect.poll(stored).toContain("name: apex-reviewer");
});

test("publishing opens a pull request to develop and later publishes join it", async ({ page }) => {
    await openBuild(page);
    await page.getByRole("button", { name: /^Publish/ }).click();
    const prompt = page.locator('.aspis-dialog[data-placement="center"]');
    await prompt.getByRole("textbox").fill("Add the apex review skill");
    await prompt.locator(".aspis-dialog__foot button").last().click();
    await expect(page.getByText(/Pull request ready for your merge/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Pull request open/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Update pull request" })).toBeDisabled();
    await page.keyboard.press("s");
    await expect(page.getByRole("dialog", { name: "Settings" }).getByText("owner/mantinea · feature/build-add-the-apex-review-skill · pull request open")).toBeVisible();
});

for (const theme of ["io", "nyx"] as const) {
    test(`Build in ${theme}`, async ({ page }) => {
        await openBuild(page, theme);
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot(`build-overview-${theme}.png`);
        await accessible(page);
        await piece(page, "apex-review").click();
        await page.getByRole("tab", { name: "Guide" }).click();
        await page.getByRole("button", { name: /When should Claude reach for it\?/ }).click();
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot(`build-guide-${theme}.png`);
        await accessible(page);
        await page.getByRole("tab", { name: "Form" }).click();
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot(`build-form-${theme}.png`);
        await page.getByRole("tab", { name: "Code" }).click();
        await expect(page.locator(".cm-content")).toContainText("name: apex-reviewer");
        await expect(page).toHaveScreenshot(`build-code-${theme}.png`);
    });
}

test("the form leads with what a skill needs, and More options opens on its own once one of them is set", async ({ page }) => {
    await openBuild(page);
    await piece(page, "apex-review").click();
    await page.getByRole("tab", { name: "Form" }).click();
    const more = page.getByRole("button", { name: "More options" });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(field(page, "Description")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Effort" })).toBeHidden();
    await more.click();
    await page.getByRole("combobox", { name: "Effort" }).selectOption("high");
    await page.getByRole("button", { name: "Build", exact: true }).first().click();
    await piece(page, "apex-review").click();
    await page.getByRole("tab", { name: "Form" }).click();
    await expect(page.getByRole("button", { name: "More options" })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("combobox", { name: "Effort" })).toHaveValue("high");
});

test("Build fits the window in every mode, says everything once and starts on one line", async ({ page }) => {
    await openBuild(page);
    await piece(page, "apex-review").click();
    for (const size of [
        { width: 1024, height: 640 },
        { width: 1440, height: 900 },
        { width: 3440, height: 1369 },
    ]) {
        await page.setViewportSize(size);
        for (const mode of ["Guide", "Form", "Code"]) {
            await page.getByRole("tab", { name: mode }).click();
            await expect.poll(() => page.locator(".aspis-shell__main").evaluate((main) => main.scrollHeight - main.clientHeight)).toBeLessThanOrEqual(0);
            await saysEverythingOnce(page);
            await startOnOneLine(page, panes);
        }
    }
});

test("on a maximized ultrawide window the guide fills the width with four cards of one size", async ({ page }) => {
    await openBuild(page);
    await page.setViewportSize({ width: 3440, height: 1369 });
    await piece(page, "apex-review").click();
    await page.getByRole("tab", { name: "Guide" }).click();
    const boxes = await page.locator(".aspis-card").evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().toJSON() as DOMRect));
    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
        expect(Math.abs(box.width - boxes[0]!.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(box.top - boxes[0]!.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(box.bottom - boxes[0]!.bottom)).toBeLessThanOrEqual(1);
    }
    const main = await page.locator(".aspis-shell__main").boundingBox();
    expect(main!.x + main!.width - boxes.at(-1)!.right).toBeLessThanOrEqual(17);
});

test("the tutorial can be switched off in Settings: no Guide, and new pieces open in the form", async ({ page }) => {
    await openBuild(page);
    await page.keyboard.press("s");
    await page.getByRole("switch", { name: "Build tutorial" }).click();
    await page.keyboard.press("Escape");
    await create(page, "command", "deploy");
    await expect(page.getByRole("tab", { name: "Form" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Guide" })).toHaveCount(0);
});
