import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const src = import.meta.dir;
const read = (...parts: string[]) => readFileSync(join(src, ...parts), "utf8");
const all = (text: string, pattern: RegExp) => new Set(Array.from(text.matchAll(pattern), (match) => match[1]!));
const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/*
 * Synthic's tokens are copied verbatim into tokens/synthic.css: a block for dark (Space, also :root) and one for
 * light (Earth) that hold the colours and shadows, then one :root block of geometry and type shared by both.
 */
const themes = ["dark", "light"] as const;
const blocks = (css: string) => Array.from(uncomment(css).matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => ({ selector: match[1]!.trim(), body: match[2]! }));
const definitions = (body: string) => new Map(Array.from(body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g), (match) => [match[1]!, match[2]!.trim()]));
const synthic = blocks(read("tokens", "synthic.css"));
const palettes = {
    dark: definitions(synthic.find((block) => block.selector.includes('[data-theme="dark"]'))!.body),
    light: definitions(synthic.find((block) => block.selector === '[data-theme="light"]')!.body),
};
const shared = definitions(synthic.find((block) => block.selector === ":root")!.body);
const geometry = definitions(read("tokens", "geometry.css"));
const base = read("base.css");
const markup = readdirSync(join(src, "components"))
    .map((file) => read("components", file))
    .join("\n");
const views = (dir: string): string =>
    readdirSync(dir, { withFileTypes: true })
        .map((entry) => (entry.isDirectory() ? views(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? readFileSync(join(dir, entry.name), "utf8") : ""))
        .join("\n");
const app = views(join(src, "..", "..", "..", "apps", "ui", "src"));

const classesIn = (text: string) => all(text, /\b(aspis-[a-z]+(?:-[a-z]+)*(?:__[a-z]+(?:-[a-z]+)*)?)\b/g);
const markupClasses = new Set([...classesIn(markup + app)].filter((name) => !name.startsWith("aspis-main")));
const cssClasses = (css: string) => all(uncomment(css), /\.(aspis-[a-z-]+(?:__[a-z-]+)?)/g);

interface Rule {
    selectors: string[];
    declarations: [string, string][];
}

const rules = (css: string): Rule[] =>
    Array.from(uncomment(css).replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => ({
        selectors: match[1]!
            .replace(/@media[^{]*$/, "")
            .split(",")
            .map((selector) => selector.trim())
            .filter(Boolean),
        declarations: match[2]!
            .split(";")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => [line.slice(0, line.indexOf(":")).trim(), line.slice(line.indexOf(":") + 1).trim()] as [string, string]),
    })).filter((rule) => rule.selectors.length > 0);

describe("tokens", () => {
    test("both themes define exactly the same vocabulary", () => {
        expect([...palettes.dark.keys()].sort()).toEqual([...palettes.light.keys()].sort());
    });

    /*
     * A theme holds colours and shadows only. Sizes, spacing, radii and type live once, in the shared :root block
     * and in geometry.css, so dark and light lay out the same page to the pixel.
     */
    test("themes paint and never size", () => {
        for (const theme of themes) {
            const sized = [...palettes[theme]].filter(([name, value]) => !name.startsWith("--shadow-") && !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value));
            expect(sized).toEqual([]);
        }
        expect([...shared.keys()].filter((name) => palettes.dark.has(name))).toEqual([]);
    });

    test("every token used is defined, and every Aspis token defined is used", () => {
        const local = all(base, /(--aspis-[a-z0-9-]+)\s*:/g);
        const defined = new Set([...palettes.dark.keys(), ...shared.keys(), ...geometry.keys(), ...local]);
        const used = all(base + markup + app, /var\((--[a-z0-9-]+)/g);
        expect([...used].filter((name) => !defined.has(name))).toEqual([]);
        expect([...geometry.keys(), ...local].filter((name) => name.startsWith("--aspis-") && !used.has(name))).toEqual([]);
    });

    test("every animation defined is used", () => {
        const css = uncomment(base);
        const defined = [...css.matchAll(/@keyframes ([a-z-]+)/g)].map((match) => match[1]!);
        expect(defined.filter((name) => !new RegExp(`animation(-name)?:[^;]*\\b${name}\\b`).test(css))).toEqual([]);
    });
});

describe("purity", () => {
    test.each(["base.css", "tokens/geometry.css"])("%s holds no literal colours", (file) => {
        const text = uncomment(read(...file.split("/")));
        expect(text.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\(/g) ?? []).toEqual([]);
    });

    test("structure reads only Synthic's tokens and the few Aspis adds", () => {
        const known = new Set([...palettes.dark.keys(), ...shared.keys(), ...geometry.keys(), "--aspis-tone", "--aspis-tone-tile", "--aspis-tone-ink"]);
        expect([...all(base, /var\((--[a-z0-9-]+)/g)].filter((name) => !known.has(name))).toEqual([]);
    });

    test("no theme selector in the structure: one layout, two paints", () => {
        expect(rules(base).flatMap((rule) => rule.selectors).filter((selector) => /data-theme="/.test(selector))).toEqual([]);
    });

    /*
     * Only controls of a fixed height may have a border, and only the button and the switch do: fields are an
     * underline drawn as an inset shadow. Contrast themes give the field its border back, as shadows are dropped there.
     */
    test("lines never take space: free-height boxes draw them as inset shadows", () => {
        const fixed = /aspis-(button|switch__track)|^\.aspis-field__input$/;
        const bordered = rules(base).filter((rule) => rule.declarations.some(([name, value]) => /^border(-(top|right|bottom|left))?$/.test(name) && /\d+px solid/.test(value) && !/transparent/.test(value)));
        expect(bordered.flatMap((rule) => rule.selectors).filter((selector) => !fixed.test(selector))).toEqual([]);
    });

    test("every component class is laid out in base, and every styled class exists in markup", () => {
        const laidOut = cssClasses(base);
        const components = [...classesIn(markup)].filter((name) => !name.startsWith("aspis-main"));
        expect(components.filter((name) => !laidOut.has(name) && !/__(label|text|lines|gutter|main|item|hint|name)$/.test(name))).toEqual([]);
        expect([...laidOut].filter((name) => !markupClasses.has(name))).toEqual([]);
    });
});

type Rgb = [number, number, number, number];

const parseColor = (value: string): Rgb => {
    const hex = value.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i)!;
    return [0, 2, 4].map((at) => parseInt(hex[1]!.slice(at, at + 2), 16)).concat(hex[2] ? parseInt(hex[2], 16) / 255 : 1) as Rgb;
};

const over = ([r, g, b, a]: Rgb, [br, bg, bb]: Rgb): Rgb => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
const luminance = ([r, g, b]: Rgb) =>
    [r, g, b].map((channel) => (channel / 255 <= 0.03928 ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4)).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
const contrast = (front: Rgb, back: Rgb) => {
    const [high, low] = [luminance(over(front, back)), luminance(back)].sort((a, b) => b - a);
    return (high! + 0.05) / (low! + 0.05);
};

describe.each(themes)("contrast in %s", (theme) => {
    const color = (token: string) => parseColor(palettes[theme].get(`--${token}`)!);
    const grounds = ["ground", "ground-raised", "ground-sunken", "ground-hover", "ground-selected"];
    const hues = ["moss", "clay", "sky", "sun", "nebula", "tide"];
    const text = ["ink", "ink-muted", "up", "down", ...hues.map((hue) => `${hue}-ink`)];
    const ratios = (fronts: string[], backs: string[]) => fronts.flatMap((front) => backs.map((back) => [`${front} on ${back}`, contrast(color(front), color(back))] as const));

    test("text reaches 4.5:1 on every surface", () => {
        expect(ratios(text, grounds).filter(([, ratio]) => ratio < 4.5)).toEqual([]);
        expect(ratios(["on-primary"], ["primary-fill"]).filter(([, ratio]) => ratio < 4.5)).toEqual([]);
        expect(ratios(["ink-inverse"], ["ink"]).filter(([, ratio]) => ratio < 4.5)).toEqual([]);
        for (const hue of hues) expect(ratios([`${hue}-ink`], [`${hue}-tile`]).filter(([, ratio]) => ratio < 4.5)).toEqual([]);
    });

    /* The vivid hues are glyphs, never text: an icon is read at 3:1, on the ground and on its own tint. */
    test("glyphs in their hue reach 3:1 on the grounds and their tint", () => {
        expect(ratios(hues, ["ground", "ground-raised"]).filter(([, ratio]) => ratio < 3)).toEqual([]);
        for (const hue of hues) expect(ratios([hue], [`${hue}-tile`]).filter(([, ratio]) => ratio < 3)).toEqual([]);
    });

    test("text in a hue always takes its ink, never the vivid glyph colour", () => {
        const painted = rules(base).filter((rule) => rule.declarations.some(([name, value]) => name === "color" && hues.some((hue) => value === `var(--${hue})`)));
        expect(painted.flatMap((rule) => rule.selectors).filter((selector) => !/aspis-phase|__dot|__glyph/.test(selector))).toEqual([]);
    });

    /* A control's edge is read against what surrounds it, the ground or a floating surface, never its own well. */
    test("control boundaries and focus reach 3:1", () => {
        expect(ratios(["line-control"], ["ground", "ground-raised"]).filter(([, ratio]) => ratio < 3)).toEqual([]);
        expect(ratios(["focus"], ["ground", "ground-raised", "ground-sunken"]).filter(([, ratio]) => ratio < 3)).toEqual([]);
    });

    test("the faintest ink is only for disabled controls and placeholders", () => {
        const faint = rules(base).filter((rule) => rule.declarations.some(([name, value]) => name === "color" && value.includes("--ink-faint")));
        expect(faint.flatMap((rule) => rule.selectors).filter((selector) => !/:disabled|placeholder/.test(selector))).toEqual([]);
    });
});
