import { type APIRequestContext, type Page, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const api = "http://127.0.0.1:4319";
const headers = { authorization: "Bearer dev", "content-type": "application/json" };
const runner = { harness: "claude-code", model: "claude-opus-5-5", effort: "high" };
const auditor = { harness: "codex", model: "gpt-5.5", effort: "high" };
const folder = "C:/repos/ivirma-crm";
const later = new Date(2030, 0, 15, 8, 30).getTime();

async function call<T = { id: number }>(request: APIRequestContext, path: string, method = "GET", data?: unknown): Promise<T> {
    const response = await request.fetch(`${api}${path}`, { method, headers, data });
    expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
    return (await response.json()) as T;
}

async function card(request: APIRequestContext, title: string, extra: Record<string, unknown> = {}) {
    const { id } = await call(request, "/cards", "POST", { title });
    await call(request, `/cards/${id}`, "PATCH", { brief: `Brief for ${title}`, implementer: runner, auditor, folder, baseBranch: "develop", ...extra });
    return id;
}

const move = (request: APIRequestContext, id: number, to: string, extra: Record<string, unknown> = {}) => call(request, `/cards/${id}/move`, "POST", { to, ...extra });
const act = (request: APIRequestContext, id: number, actor: string, to: string, extra: Record<string, unknown> = {}) =>
    call(request, `/dev/cards/${id}/move`, "POST", { actor, to, ...extra });

const column = (page: Page, name: string) => page.locator(`section.aspis-column[aria-label="${name}"]`);
const unfold = (page: Page, name: string) => page.getByRole("button", { name: `Show ${name}` }).click();

async function openBoard(page: Page, theme: "io" | "nyx" = "io") {
    await page.request.put(`${api}/settings`, { headers, data: { theme } });
    await page.addInitScript(() => localStorage.clear());
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/");
    await expect(page.getByText(/server live/i)).toBeVisible();
    await page.keyboard.press("k");
    await expect(column(page, "Triage")).toBeVisible();
}

function repository(name: string) {
    const dir = join(process.env.ASPIS_E2E_HOME!, "repos", name);
    mkdirSync(dir, { recursive: true });
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir });
    git("init", "-q", "-b", "develop");
    git("config", "user.name", "Aspis e2e");
    git("config", "user.email", "e2e@aspis.local");
    writeFileSync(join(dir, "README.md"), "# e2e");
    git("add", "-A");
    git("commit", "-q", "-m", "init");
    return dir;
}

async function confirm(page: Page, text: string) {
    const dialog = page.locator('.aspis-dialog[data-placement="center"]');
    await dialog.getByRole("textbox").fill(text);
    await dialog.locator(".aspis-dialog__foot button").last().click();
    await expect(dialog).toHaveCount(0);
}

test.describe.configure({ mode: "serial" });

test("the board in both themes", async ({ page, request }) => {
    await card(request, "Map the Quote record types", { priority: 2 });
    const scheduled = await card(request, "Nightly test run on UAT", { scheduledAt: later, recurrence: "weekdays" });
    await move(request, scheduled, "scheduled");
    const ready = await card(request, "Cover the callout retry path", { priority: 1 });
    await move(request, ready, "ready");
    const running = await card(request, "Move pricing rules to a selector");
    await move(request, running, "ready");
    await act(request, running, "agent", "running", { sessionId: "s-1" });
    const blocked = await card(request, "Fix the flow fault path");
    await move(request, blocked, "ready");
    await act(request, blocked, "agent", "running", { sessionId: "s-2" });
    await act(request, blocked, "agent", "blocked", { note: "Which org has the failing flow?" });
    const review = await card(request, "Archive stale Quote fields");
    await move(request, review, "ready");
    await act(request, review, "agent", "running", { sessionId: "s-3" });
    await act(request, review, "agent", "review", { note: "Removed 14 fields, tests green" });
    await call(request, `/dev/cards/${review}/verdict`, "POST", { ok: true, reason: "Diff matches the brief" });

    for (const theme of ["io", "nyx"] as const) {
        await openBoard(page, theme);
        await expect(column(page, "Review").getByText("Archive stale Quote fields")).toBeVisible();
        await page.mouse.move(0, 0);
        await expect(page).toHaveScreenshot(`board-${theme}.png`);
        await column(page, "Review").getByText("Archive stale Quote fields").click();
        await expect(page.locator(".aspis-dialog__box")).toBeVisible();
        await expect(page).toHaveScreenshot(`card-${theme}.png`, { mask: [page.locator(".aspis-thread__when")] });
    }
});

test("a ready card goes all the way to archived through the panel", async ({ page }) => {
    await openBoard(page);
    await column(page, "Triage").getByRole("button", { name: "+ New" }).click();
    await page.keyboard.type("Ready route card");
    await page.keyboard.press("Enter");
    await column(page, "Triage").getByText("Ready route card").click();

    const panel = page.locator(".aspis-dialog__box");
    await panel.getByLabel("Brief").fill("Walk the whole ready route");
    await panel.getByLabel("Folder").click();
    await expect(panel.getByRole("button", { name: "Ready", exact: true })).toBeEnabled();
    await panel.getByRole("button", { name: "Ready", exact: true }).click();
    await expect(panel.getByText("Agent picks it up")).toBeVisible();

    await panel.getByRole("button", { name: "Agent picks it up" }).click();
    await panel.getByRole("button", { name: "Agent delivers" }).click();
    await confirm(page, "Everything done");
    await panel.getByRole("button", { name: "Auditor ✓" }).click();
    await confirm(page, "Matches the brief");
    await expect(panel.getByRole("button", { name: "Done", exact: true })).toBeDisabled();
    await panel.getByRole("button", { name: "Approve" }).click();
    await confirm(page, "Approved");
    await panel.getByRole("button", { name: "Done", exact: true }).click();
    await panel.getByRole("button", { name: "Archived", exact: true }).click();
    await page.keyboard.press("Escape");
    await unfold(page, "Archived");
    await expect(column(page, "Archived").getByText("Ready route card")).toBeVisible();
});

test("a recurring scheduled card archives itself and schedules its next run", async ({ page, request }) => {
    const id = await card(request, "Recurring audit", { scheduledAt: Date.now() - 60_000, recurrence: "daily" });
    await move(request, id, "scheduled");
    await openBoard(page);
    await column(page, "Scheduled").getByText("Recurring audit").click();
    const panel = page.locator(".aspis-dialog__box");
    await panel.getByRole("button", { name: "System starts it" }).click();
    await panel.getByRole("button", { name: "System finishes" }).click();
    await page.keyboard.press("Escape");
    await unfold(page, "Archived");
    await expect(column(page, "Archived").getByText("Recurring audit")).toBeVisible();
    await expect(column(page, "Scheduled").getByText("Recurring audit")).toBeVisible();
});

test("done and archived start folded and the board remembers what you open", async ({ page }) => {
    await openBoard(page);
    await expect(column(page, "Done").locator(".aspis-column__list")).toHaveCount(0);
    await expect(column(page, "Archived")).toHaveAttribute("data-folded", "true");
    await unfold(page, "Done");
    await column(page, "Triage").getByRole("button", { name: "Fold Triage" }).click();
    await expect(column(page, "Triage")).toHaveAttribute("data-folded", "true");
    await page.keyboard.press("h");
    await page.keyboard.press("k");
    await expect(column(page, "Done").locator(".aspis-column__list")).toHaveCount(1);
    await expect(column(page, "Triage")).toHaveAttribute("data-folded", "true");
    await page.setViewportSize({ width: 1440, height: 900 });
    const overflow = () => page.locator(".aspis-board").evaluate((board) => board.scrollWidth - board.clientWidth);
    expect(await overflow()).toBe(0);
    await page.setViewportSize({ width: 1024, height: 700 });
    expect(await overflow()).toBeGreaterThan(0);
});

test("drag and drop only lands where the rules allow", async ({ page, request }) => {
    await card(request, "Drag me");
    await openBoard(page);
    const tile = column(page, "Triage").getByRole("button", { name: /Drag me/ });
    await tile.hover();
    await page.mouse.down();
    await column(page, "Running").hover();
    await expect(column(page, "Running")).toHaveAttribute("data-drop", "refused");
    await expect(column(page, "Ready")).toHaveAttribute("data-drop", "allowed");
    await expect(column(page, "Triage")).not.toHaveAttribute("data-drop");
    await column(page, "Ready").hover();
    await page.mouse.up();
    await expect(column(page, "Ready").getByText("Drag me")).toBeVisible();
});

test("a blocked card needs your answer to go back to running", async ({ page, request }) => {
    const id = await card(request, "Blocked on a question");
    await move(request, id, "ready");
    await act(request, id, "agent", "running", { sessionId: "s-9" });
    await act(request, id, "agent", "blocked", { note: "Which sandbox?" });
    await openBoard(page);
    await column(page, "Blocked").getByText("Blocked on a question").click();
    await page.locator(".aspis-dialog__box").getByRole("button", { name: "Running", exact: true }).click();
    await confirm(page, "Use the UAT sandbox");
    await page.keyboard.press("Escape");
    await expect(column(page, "Running").getByText("Blocked on a question")).toBeVisible();
});

test("a card written by another process shows up in under a second", async ({ page }) => {
    await openBoard(page);
    execFileSync("bun", ["e2e/support/external-write.ts", "Written by another process"], { env: { ...process.env, ASPIS_HOME: process.env.ASPIS_E2E_HOME } });
    await expect(column(page, "Triage").getByText("Written by another process")).toBeVisible({ timeout: 1000 });
});

test("a due scheduled card runs headless, streams its log and lands in archived with its commit", async ({ page, request }) => {
    const id = await card(request, "Nightly release note", { folder: repository("nightly"), scheduledAt: Date.now() - 60_000 });
    await move(request, id, "scheduled");
    await openBoard(page);
    expect(await call<{ started: number[] }>(request, "/dev/dispatch", "POST")).toEqual({ started: [id] });
    await unfold(page, "Archived");
    await column(page, "Archived").getByText("Nightly release note").click({ timeout: 15_000 });
    const panel = page.locator(".aspis-dialog__box");
    await expect(panel.locator(".aspis-log")).toContainText("Writing the note.");
    await expect(panel.getByText(/Committed [0-9a-f]+ on feature\/develop\/card-/)).toBeVisible();
});

test("stop ends a live run and blocks the card with the reason", async ({ page, request }) => {
    const id = await card(request, "Long migration #slow", { folder: repository("long"), scheduledAt: Date.now() - 60_000 });
    await move(request, id, "scheduled");
    await openBoard(page);
    await call(request, "/dev/dispatch", "POST");
    await column(page, "Running").getByText("Long migration #slow").click();
    const panel = page.locator(".aspis-dialog__box");
    await expect(panel.locator(".aspis-log")).toContainText("Working on it");
    await panel.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(panel.locator(".aspis-chip", { hasText: "Stopped by you." })).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(column(page, "Blocked").getByText("Long migration #slow")).toBeVisible();
});

function hook(event: Record<string, unknown>) {
    const output = execFileSync("bun", ["apps/server/src/dev.ts", "hook", "--harness", "claude-code"], {
        input: JSON.stringify(event),
        env: { ...process.env, ASPIS_HOME: process.env.ASPIS_E2E_HOME },
    }).toString();
    return output ? JSON.parse(output).hookSpecificOutput : undefined;
}

test("a CLI session picks up a ready card, receives your note, and the auditor judges its delivery", async ({ page, request }) => {
    const folder = repository("pickup");
    const id = await card(request, "Cover the bulk path", { folder, auditor: runner });
    await move(request, id, "ready");
    await openBoard(page);
    await column(page, "Ready").getByText("Cover the bulk path").click();
    const panel = page.locator(".aspis-dialog__box");
    await expect(panel.locator(".aspis-code")).toContainText("/dya-pickup");

    const picked = hook({ hook_event_name: "UserPromptSubmit", session_id: "e2e-session", cwd: folder, prompt: "/dya-pickup" });
    expect(picked.additionalContext).toContain(`picked up card #${id}`);
    await expect(panel.getByText("claude --resume e2e-session")).toBeVisible();
    await expect(panel.locator(".aspis-log")).toContainText("Picked up by claude-code session e2e-session");

    await panel.getByRole("textbox", { name: "Note" }).fill("Keep the old signature");
    await panel.getByRole("button", { name: "Add note" }).click();
    const delivered = hook({ hook_event_name: "PreToolUse", session_id: "e2e-session", cwd: folder, tool_name: "Bash", tool_input: { command: "git status" } });
    expect(delivered.additionalContext).toContain("Keep the old signature");
    await expect(panel.locator(".aspis-thread__when", { hasText: "delivered" })).toHaveCount(1);
    await expect(panel.locator(".aspis-log")).toContainText("Bash git status");

    await act(request, id, "agent", "review", { note: "Bulk path covered" });
    await call(request, "/dev/dispatch", "POST");
    await expect(panel.locator(".aspis-mark", { hasText: "Auditor" })).toHaveAttribute("data-state", "ok", { timeout: 15_000 });
    await expect(panel.getByText("The branch does what the brief asks", { exact: true })).toBeVisible();
});
