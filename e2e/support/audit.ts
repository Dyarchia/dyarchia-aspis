import AxeBuilder from "@axe-core/playwright";
import { type Page, expect } from "@playwright/test";

export const api = "http://127.0.0.1:4319";
export const headers = { authorization: "Bearer dev", "content-type": "application/json" };
export type ThemeName = "io" | "nyx";

export async function useTheme(page: Page, theme: ThemeName) {
    await page.request.put(`${api}/settings`, { headers, data: { theme } });
    await expect(page.locator(`html[data-theme="${theme}"]`)).toBeAttached();
    await page.evaluate(() => document.fonts.ready);
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
