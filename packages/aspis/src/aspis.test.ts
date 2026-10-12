import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const src = import.meta.dir;
const read = (...parts: string[]) => readFileSync(join(src, ...parts), "utf8");
const all = (text: string, pattern: RegExp) => new Set(Array.from(text.matchAll(pattern), (match) => match[1]!));

const themes = ["io", "nyx"] as const;
const tokens = Object.fromEntries(themes.map((theme) => [theme, all(read("tokens", `${theme}.css`), /(--aspis-[a-z0-9-]+)\s*:/g)]));
const base = read("base.css");
const shapes = Object.fromEntries(themes.map((theme) => [theme, read("shape", `${theme}.css`)]));
const structure = [base, ...Object.values(shapes)];
const markup = readdirSync(join(src, "components"))
    .map((file) => read("components", file))
    .join("\n");

const classesIn = (text: string) => all(text, /\b(aspis-[a-z]+(?:-[a-z]+)*(?:__[a-z]+(?:-[a-z]+)*)?)\b/g);
const markupClasses = new Set([...classesIn(markup)].filter((name) => !name.startsWith("aspis-ratio")));
const cssClasses = all(structure.join("\n"), /\.(aspis-[a-z-]+(?:__[a-z-]+)?)/g);
const blocks = [...markupClasses].filter((name) => !name.includes("__"));
const layoutOnly = new Set(["aspis-toaster"]);

describe("tokens", () => {
    test("both themes define exactly the same vocabulary", () => {
        expect([...tokens.io!].sort()).toEqual([...tokens.nyx!].sort());
    });

    test("every token used by structure is defined by the themes", () => {
        const local = all(base, /(--aspis-[a-z0-9-]+)\s*:/g);
        local.add("--aspis-ratio");
        const used = all(structure.join("\n") + markup, /var\((--aspis-[a-z0-9-]+)/g);
        const missing = [...used].filter((name) => !tokens.io!.has(name) && !local.has(name));
        expect(missing).toEqual([]);
    });
});

describe("purity", () => {
    test.each(["base.css", "shape/io.css", "shape/nyx.css"])("%s holds no literal colours", (file) => {
        const text = read(...file.split("/")).replace(/\/\*[\s\S]*?\*\//g, "");
        expect(text.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\(/g) ?? []).toEqual([]);
    });

    test("structure only reads aspis variables", () => {
        const foreign = [...all(structure.join("\n"), /var\((--[a-z0-9-]+)/g)].filter((name) => !name.startsWith("--aspis-"));
        expect(foreign).toEqual([]);
    });
});

describe("shape", () => {
    test.each(themes)("%s gives a shape to every component block", (theme) => {
        const unshaped = blocks.filter((block) => !layoutOnly.has(block) && !new RegExp(`\\.${block}(?![a-z-])`).test(shapes[theme]!));
        expect(unshaped).toEqual([]);
    });

    test("every styled class exists in markup", () => {
        expect([...cssClasses].filter((name) => !markupClasses.has(name))).toEqual([]);
    });
});
