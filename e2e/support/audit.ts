import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, type Page, expect } from "@playwright/test";
import { join } from "node:path";

export const api = "http://127.0.0.1:4319";
export const headers = { authorization: "Bearer dev", "content-type": "application/json" };
export type ThemeName = "io" | "nyx";

/* The project every e2e card lives on unless a test makes its own, made the first time a spec asks for it. */
export async function project(request: APIRequestContext): Promise<number> {
    const boards = (await (await request.get(`${api}/boards`, { headers })).json()) as { id: number; name: string }[];
    const found = boards.find((board) => board.name === "ivirma-crm");
    if (found) return found.id;
    const folder = join(process.env.ASPIS_E2E_HOME!, "repos", "ivirma-crm");
    const created = await request.post(`${api}/boards`, { headers, data: { name: "ivirma-crm", folder } });
    expect(created.ok(), await created.text()).toBe(true);
    return ((await created.json()) as { id: number }).id;
}

export async function useTheme(page: Page, theme: ThemeName) {
    await page.request.put(`${api}/settings`, { headers, data: { theme } });
    await expect(page.locator(`html[data-theme="${theme}"]`)).toBeAttached();
    await page.evaluate(() => document.fonts.ready);
}

/*
 * Only the panes scroll, and only down: no element may scroll sideways, and a dialog never scrolls itself beside its
 * body. A second scrollbar or a horizontal one is always something leaking out of its box. The board is the one
 * exception: its columns scroll sideways when the window is too narrow for all of them.
 */
export async function scrollsOnlyDown(page: Page) {
    const leaks = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("*")].flatMap((element) => {
            const style = getComputedStyle(element);
            const scrolls = (axis: string) => ["auto", "scroll"].includes(axis);
            const sideways = scrolls(style.overflowX) && element.scrollWidth > element.clientWidth && !element.matches(".aspis-board");
            const dialog = element.matches("dialog") && element.scrollHeight > element.clientHeight;
            return sideways || dialog ? [`${element.tagName.toLowerCase()}.${[...element.classList].join(".")}`] : [];
        }),
    );
    expect(leaks).toEqual([]);
}

export const live = (page: Page) => expect(page.locator('.aspis-shell[data-state="live"]')).toBeAttached();

/*
 * WCAG 2.2 AA as axe sees it. Only serious and critical findings fail the run; the rest are printed so they get
 * fixed without blocking.
 */
export async function accessible(page: Page, exclude: string[] = []) {
    let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
    for (const selector of exclude) builder = builder.exclude(selector);
    const { violations } = await builder.analyze();
    const blocking = violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

/*
 * Minimalism as a check: within what is in front of the user (the top dialog when one is open, else the window),
 * no heading, label, button, tab, link or menu entry says the same thing twice. Case is ignored because io writes
 * structure in capitals; only what is actually painted counts, so screen-reader-only titles are left out. The same
 * action on every row of a list (Remove, Wire it) is one action, not a repeat.
 */
export async function saysEverythingOnce(page: Page) {
    const repeated = await page.evaluate(() => {
        const dialogs = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")];
        const root = dialogs.at(-1) ?? document.body;
        const seen = new Map<string, number>();
        const selector = "h1, h2, h3, label, button, a, [role='tab'], .aspis-menu__label, .aspis-group__label, .aspis-column__title, .aspis-dialog__title";
        for (const element of root.querySelectorAll<HTMLElement>(selector)) {
            if (element.closest(".aspis-sr") || !element.checkVisibility({ visibilityProperty: true })) continue;
            const rect = element.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            const text = element.innerText.trim().toLowerCase();
            const outer = element.parentElement?.closest<HTMLElement>(selector);
            if (!text || (outer && root.contains(outer) && outer.innerText.trim().toLowerCase() === text)) continue;
            const row = element.closest("li");
            if (element.tagName === "BUTTON" && row && row.innerText.trim().toLowerCase() !== text) continue;
            seen.set(text, (seen.get(text) ?? 0) + 1);
        }
        return [...seen].filter(([, count]) => count > 1).map(([text, count]) => `${text} x${count}`);
    });
    expect(repeated).toEqual([]);
}

/*
 * Every pane opens on the same top line as the sidebar, so the eye reads one row across the window instead of a
 * staircase down it. Each selector names the first row of a pane.
 */
export async function startOnOneLine(page: Page, selectors: string[]) {
    const tops = await page.evaluate(
        (list) => list.map((selector) => [selector, document.querySelector(selector)?.getBoundingClientRect().top ?? Number.NaN] as const),
        [".aspis-shell__link", ...selectors],
    );
    const line = tops[0]![1];
    expect(tops.filter(([, top]) => !(Math.abs(top - line) <= 1)).map(([selector, top]) => `${selector} at ${top}, the line is at ${line}`)).toEqual([]);
}

interface Box {
    key: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

const measure = (page: Page) =>
    page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("[class*='aspis-']")]
            .filter((element) => element.getClientRects().length > 0 && !element.classList.contains("aspis-button__glint"))
            .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                    key: [...element.classList].filter((name) => name.startsWith("aspis-")).join(" "),
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    w: Math.round(rect.width),
                    h: Math.round(rect.height),
                };
            }),
    );

/*
 * Lays the same page out in io and in nyx and asserts that every aspis element sits in the same box. A theme may
 * choose its own typeface, weight, case and tracking, which changes how wide a word is; to compare layouts and not
 * typefaces, both are measured with one shared face and none of those choices.
 */
export async function sameLayout(page: Page, show: () => Promise<void>) {
    const neutral = await page.addStyleTag({
        content: "*, *::before, *::after { font-family: 'Geist Mono Variable', monospace !important; font-weight: 400 !important; font-style: normal !important; letter-spacing: 0 !important; text-transform: none !important; }",
    });
    const boxes: Record<ThemeName, Box[]> = { io: [], nyx: [] };
    for (const theme of ["io", "nyx"] as const) {
        await useTheme(page, theme);
        await show();
        await page.mouse.move(0, 0);
        boxes[theme] = await measure(page);
    }
    await neutral.evaluate((tag) => tag.remove());
    expect(boxes.nyx.map((box) => box.key)).toEqual(boxes.io.map((box) => box.key));
    const drift = boxes.io.flatMap((io, index) => {
        const nyx = boxes.nyx[index]!;
        const off = (["x", "y", "w", "h"] as const).filter((field) => Math.abs(io[field] - nyx[field]) > 1);
        return off.length ? [`${io.key}: ${off.map((field) => `${field} ${io[field]} vs ${nyx[field]}`).join(", ")}`] : [];
    });
    expect(drift).toEqual([]);
}
