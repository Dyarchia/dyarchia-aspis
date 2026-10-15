import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const src = import.meta.dir;
const read = (...parts: string[]) => readFileSync(join(src, ...parts), "utf8");
const all = (text: string, pattern: RegExp) => new Set(Array.from(text.matchAll(pattern), (match) => match[1]!));
const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const themes = ["io", "nyx"] as const;
const definitions = (css: string) => new Map(Array.from(uncomment(css).matchAll(/(--aspis-[a-z0-9-]+)\s*:\s*([^;]+);/g), (match) => [match[1]!, match[2]!.trim()]));
const geometry = definitions(read("tokens", "geometry.css"));
const palettes = Object.fromEntries(themes.map((theme) => [theme, definitions(read("tokens", `${theme}.css`))]));
const base = read("base.css");
const shapes = Object.fromEntries(themes.map((theme) => [theme, read("shape", `${theme}.css`)]));
const structure = [base, ...Object.values(shapes)];
const markup = readdirSync(join(src, "components"))
    .map((file) => read("components", file))
    .join("\n");
const views = (dir: string): string =>
    readdirSync(dir, { withFileTypes: true })
        .map((entry) => (entry.isDirectory() ? views(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? readFileSync(join(dir, entry.name), "utf8") : ""))
        .join("\n");
const app = views(join(src, "..", "..", "..", "apps", "ui", "src"));

const classesIn = (text: string) => all(text, /\b(aspis-[a-z]+(?:-[a-z]+)*(?:__[a-z]+(?:-[a-z]+)*)?)\b/g);
const markupClasses = new Set([...classesIn(markup)].filter((name) => !name.startsWith("aspis-main")));
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

/*
 * What a theme may say about a box: how it is painted, its type face, and motion that never moves it in the
 * flow. Anything else would let io and nyx place or size the same element differently.
 */
const paint = [
    /^color$/,
    /^background(-[a-z-]+)?$/,
    /^border(-(top|right|bottom|left))?-(color|style)$/,
    /^border(-[a-z-]+)?-radius$/,
    /^box-shadow$/,
    /^outline(-[a-z]+)?$/,
    /^opacity$/,
    /^(backdrop-)?filter$/,
    /^transform$/,
    /^transition(-[a-z-]+)?$/,
    /^animation(-[a-z-]+)?$/,
    /^font-(family|weight|style)$/,
    /^letter-spacing$/,
    /^text-transform$/,
    /^text-(decoration|underline|shadow)(-[a-z-]+)?$/,
    /^mask(-[a-z-]+)?$/,
    /^clip-path$/,
    /^mix-blend-mode$/,
    /^offset-(path|distance)$/,
    /^z-index$/,
    /^pointer-events$/,
];

describe("tokens", () => {
    test("both themes define exactly the same vocabulary", () => {
        expect([...palettes.io!.keys()].sort()).toEqual([...palettes.nyx!.keys()].sort());
    });

    test("geometry is defined once, for every theme, and themes size their type from it", () => {
        for (const theme of themes) {
            expect([...palettes[theme]!.keys()].filter((name) => geometry.has(name))).toEqual([]);
            const sized = [...palettes[theme]!].filter(([name, value]) => name.startsWith("--aspis-type-") && /\d(px|rem|em)\b/.test(value));
            expect(sized).toEqual([]);
        }
    });

    test("every token used is defined, and every token defined is used", () => {
        const local = all(base, /(--aspis-[a-z0-9-]+)\s*:/g);
        const defined = new Set([...geometry.keys(), ...palettes.io!.keys(), ...local, "--aspis-tone"]);
        const tokenText = [...Object.values(palettes), geometry].flatMap((map) => [...map.values()]).join("\n");
        const used = all(structure.join("\n") + markup + app + tokenText, /var\((--aspis-[a-z0-9-]+)/g);
        expect([...used].filter((name) => !defined.has(name))).toEqual([]);
        expect([...defined].filter((name) => !used.has(name) && !local.has(name))).toEqual([]);
    });

    test("every animation defined is used", () => {
        const css = uncomment(structure.join("\n"));
        const defined = [...css.matchAll(/@keyframes ([a-z-]+)/g)].map((match) => match[1]!);
        expect(defined.filter((name) => !new RegExp(`animation(-name)?:[^;]*\\b${name}\\b`).test(css))).toEqual([]);
    });
});

describe("purity", () => {
    test.each(["base.css", "shape/io.css", "shape/nyx.css", "tokens/geometry.css"])("%s holds no literal colours", (file) => {
        const text = uncomment(read(...file.split("/")));
        expect(text.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\(/g) ?? []).toEqual([]);
    });

    test("structure only reads aspis variables", () => {
        const foreign = [...all(structure.join("\n"), /var\((--[a-z0-9-]+)/g)].filter((name) => !name.startsWith("--aspis-"));
        expect(foreign).toEqual([]);
    });
});

describe("one layout, two paints", () => {
    test.each(themes)("shape/%s.css only paints", (theme) => {
        const parsed = rules(shapes[theme]!);
        const absolute = new Set(parsed.filter((rule) => rule.declarations.some(([name, value]) => name === "position" && value === "absolute")).flatMap((rule) => rule.selectors));
        const breaches = parsed.flatMap((rule) =>
            rule.declarations
                .filter(([name]) => !paint.some((pattern) => pattern.test(name)))
                .filter(() => !rule.selectors.every((selector) => /::(before|after)$/.test(selector) && absolute.has(selector)))
                .map(([name, value]) => `${rule.selectors.join(", ")} { ${name}: ${value} }`),
        );
        expect(breaches).toEqual([]);
    });

    test.each(themes)("shape/%s.css never hides or fades content, only decoration", (theme) => {
        const faded = rules(shapes[theme]!).filter((rule) => rule.declarations.some(([name, value]) => (name === "opacity" && Number(value) < 1) || name === "visibility"));
        expect(faded.flatMap((rule) => rule.selectors).filter((selector) => !/::(before|after)$|__glint$/.test(selector))).toEqual([]);
    });

    test("every component class is laid out in base, and every styled class exists in markup", () => {
        const laidOut = cssClasses(base);
        expect([...markupClasses].filter((name) => !laidOut.has(name) && !/__(label|text|lines|gutter|main|item|hint|name)$/.test(name))).toEqual([]);
        const styled = new Set([...cssClasses(base), ...structure.flatMap((css) => [...cssClasses(css)])]);
        expect([...styled].filter((name) => !markupClasses.has(name))).toEqual([]);
    });
});

type Rgb = [number, number, number, number];

const parseColor = (value: string): Rgb | undefined => {
    const hex = value.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (hex) return [0, 2, 4].map((at) => parseInt(hex[1]!.slice(at, at + 2), 16)).concat(hex[2] ? parseInt(hex[2], 16) / 255 : 1) as Rgb;
    const rgb = value.match(/^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] ? Number(rgb[4]) : 1];
    return undefined;
};

const over = ([r, g, b, a]: Rgb, [br, bg, bb]: Rgb): Rgb => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
const luminance = ([r, g, b]: Rgb) =>
    [r, g, b].map((channel) => (channel / 255 <= 0.03928 ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4)).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
const contrast = (front: Rgb, back: Rgb) => {
    const [high, low] = [luminance(over(front, back)), luminance(back)].sort((a, b) => b - a);
    return (high! + 0.05) / (low! + 0.05);
};

describe.each(themes)("contrast in %s", (theme) => {
    const color = (token: string) => parseColor(palettes[theme]!.get(`--aspis-${token}`)!)!;
    const grounds = ["bg", "bg-raised", "surface", "surface-deep"];
    const text = ["ink-1", "ink-2", "ink-3", "accent", "signal-ok", "signal-warn", "signal-danger", "signal-info", "syntax-keyword", "syntax-function", "syntax-literal", "syntax-argument", "syntax-comment"];
    const ratios = (fronts: string[], backs: string[]) => fronts.flatMap((front) => backs.map((back) => [`${front} on ${back}`, contrast(color(front), color(back))] as const));

    test("text reaches 4.5:1 on every surface", () => {
        expect(ratios(text, grounds).filter(([, ratio]) => ratio < 4.5)).toEqual([]);
        expect(ratios(["term-ink", "term-dim"], ["term-bg", "term-bar"]).filter(([, ratio]) => ratio < 4.5)).toEqual([]);
        expect(ratios(["invert-ink"], ["invert-bg"]).filter(([, ratio]) => ratio < 4.5)).toEqual([]);
    });

    test("control boundaries and focus reach 3:1", () => {
        expect(ratios(["line-control", "focus"], grounds).filter(([, ratio]) => ratio < 3)).toEqual([]);
    });

    test("the faintest ink is never used for text", () => {
        const faint = structure.flatMap((css) => rules(css)).filter((rule) => rule.declarations.some(([name, value]) => name === "color" && value.includes("--aspis-ink-4")));
        expect(faint.map((rule) => rule.selectors.join(", "))).toEqual([]);
    });
});
