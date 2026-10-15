import { type Page, expect, test } from "@playwright/test";
import { accessible, live } from "./support/audit.ts";

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

const field = (page: Page, label: string) => page.locator(".aspis-field").filter({ has: page.getByText(label, { exact: true }) }).locator("input, textarea, select").first();

test("Build connects its library in place", async ({ page }) => {
    await openBuild(page);
    await page.getByRole("textbox", { name: "Repository" }).fill("owner/mantinea");
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText("Library owner/mantinea is ready")).toBeVisible();
    await expect(page.getByRole("list", { name: "Kinds" })).toBeVisible();
});

test("a skill made in the form is the file in code, and the code drives the form back", async ({ page }) => {
    await openBuild(page);
    await page.getByRole("button", { name: /^New/ }).click();
    const prompt = page.locator('.aspis-dialog[data-placement="center"]');
    await prompt.getByRole("textbox").fill("Apex Review");
    await prompt.locator(".aspis-dialog__foot button").last().click();
    await expect(prompt.getByText("Only lowercase letters, digits and hyphens")).toBeVisible();
    await expect(prompt.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    await prompt.getByRole("textbox").fill("apex-review");
    await prompt.locator(".aspis-dialog__foot button").last().click();
    await expect(page.getByRole("heading", { name: "apex-review" })).toBeVisible();

    await field(page, "Description").fill("Use this skill when the user asks to review Apex classes.");
    await field(page, "Description").blur();
    await page.getByRole("tab", { name: "Code" }).click();
    const code = page.locator(".cm-content");
    await expect(code).toContainText("description: Use this skill when the user asks to review Apex classes.");

    await code.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.insertText("---\nname: apex-reviewer\ndescription: Use this skill when the user asks to review Apex classes.\n---\n\nSteps Claude follows when this skill applies.\n");
    await page.getByRole("tab", { name: "Form" }).click();
    await expect(field(page, "Name")).toHaveValue("apex-reviewer");
    await expect(page.getByText("The command will be /apex-reviewer, not /apex-review")).toBeVisible();

    await page.getByRole("tab", { name: "Tutorial" }).click();
    await expect(page.getByText("Step 1 of 6")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.locator('[data-field="description"]')).toHaveClass(/outline/);

    await page.keyboard.press("Control+s");
    await expect(page.getByText("1 unpublished change")).toBeVisible();
});

test("publishing opens a pull request to develop and later publishes join it", async ({ page }) => {
    await openBuild(page);
    await page.getByRole("button", { name: "Publish" }).click();
    const prompt = page.locator('.aspis-dialog[data-placement="center"]');
    await prompt.getByRole("textbox").fill("Add the apex review skill");
    await prompt.locator(".aspis-dialog__foot button").last().click();
    await expect(page.getByText(/Pull request ready for your merge/)).toBeVisible();
    await expect(page.getByText("pull request open")).toBeVisible();
    await expect(page.getByText("feature/build-add-the-apex-review-skill")).toBeVisible();
    await expect(page.getByRole("button", { name: "Update pull request" })).toBeDisabled();
});

for (const theme of ["io", "nyx"] as const) {
    test(`Build in ${theme}`, async ({ page }) => {
        await openBuild(page, theme);
        await page.getByRole("button", { name: /apex-review/ }).click();
        await expect(page.getByRole("heading", { name: "apex-review" })).toBeVisible();
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot(`build-form-${theme}.png`);
        await accessible(page);
        await page.getByRole("tab", { name: "Code" }).click();
        await expect(page.locator(".cm-content")).toContainText("name: apex-reviewer");
        await expect(page).toHaveScreenshot(`build-code-${theme}.png`);
    });
}

test("the form leads with what a skill needs, and More options opens on its own once one of them is set", async ({ page }) => {
    await openBuild(page);
    await page.getByRole("button", { name: /apex-review/ }).click();
    const more = page.getByRole("button", { name: "More options" });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(field(page, "Description")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Effort" })).toBeHidden();
    await more.click();
    await page.getByRole("combobox", { name: "Effort" }).selectOption("high");
    await page.keyboard.press("Control+s");
    await page.getByRole("button", { name: "Agents" }).click();
    await page.getByRole("button", { name: "Skills" }).click();
    await page.getByRole("button", { name: /apex-review/ }).click();
    await expect(page.getByRole("button", { name: "More options" })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("combobox", { name: "Effort" })).toHaveValue("high");
});

test("Build fits the window in every mode", async ({ page }) => {
    await openBuild(page);
    await page.getByRole("button", { name: /apex-review/ }).click();
    for (const size of [
        { width: 1440, height: 900 },
        { width: 1024, height: 640 },
    ]) {
        await page.setViewportSize(size);
        for (const mode of ["Tutorial", "Form", "Code"]) {
            await page.getByRole("tab", { name: mode }).click();
            await expect.poll(() => page.locator(".aspis-shell__main").evaluate((main) => main.scrollHeight - main.clientHeight)).toBeLessThanOrEqual(0);
        }
    }
});
