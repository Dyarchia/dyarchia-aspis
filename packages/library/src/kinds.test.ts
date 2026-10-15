import { describe, expect, test } from "bun:test";
import { kindIds, read, validate, write } from "./kind.ts";
import { kinds, pieceAt } from "./kinds.ts";

const scaffolded = (id: (typeof kindIds)[number], name = "apex-review") => {
    const kind = kinds[id];
    const files = kind.scaffold(name);
    return { kind, files, piece: { kind: id, name, path: kind.main(name), text: files[kind.main(name)]!, files: Object.keys(files) } };
};

describe.each(kindIds)("%s", (id) => {
    test("a new piece starts empty: its only errors point at a field to fill, and every file belongs to it", () => {
        const { kind, files, piece } = scaffolded(id);
        const fillable = new Set([...kind.fields.map((field) => field.key), "body"]);
        expect(validate(kind, piece).filter((issue) => issue.level === "error" && !fillable.has(issue.field ?? ""))).toEqual([]);
        for (const path of Object.keys(files)) expect(pieceAt(path)).toEqual({ kind: id, name: "apex-review" });
    });

    test("the tutorial walks real fields and covers every required one", () => {
        const kind = kinds[id];
        const keys = new Set([...kind.fields.map((field) => field.key), ...(kind.body ? ["body"] : [])]);
        const walked = new Set(kind.steps.flatMap((step) => step.fields));
        expect([...walked].filter((key) => !keys.has(key))).toEqual([]);
        expect(kind.fields.filter((field) => field.required && !walked.has(field.key)).map((field) => field.key)).toEqual([]);
        for (const step of kind.steps) expect(step.source).toStartWith("https://code.claude.com/docs/en/");
    });

    test("the form leads with real fields, every required one among them", () => {
        const kind = kinds[id];
        const keys = new Set([...kind.fields.map((field) => field.key), ...(kind.body ? ["body"] : [])]);
        expect(kind.essentials.filter((key) => !keys.has(key))).toEqual([]);
        expect(kind.fields.filter((field) => field.required && !kind.essentials.includes(field.key)).map((field) => field.key)).toEqual([]);
        if (kind.body) expect(kind.essentials).toContain("body");
    });

    test("every field reads back what the form wrote", () => {
        const { kind, piece } = scaffolded(id);
        for (const field of kind.fields) {
            const value = field.control === "toggle" ? true : field.control === "number" ? 30 : field.control === "tags" ? ["a", "b"] : field.options ? field.options[0] : "Some text";
            const text = write(kind, piece.text, field.key, value);
            expect(read(kind, text).values[field.key]).toEqual(value);
        }
    });
});

describe("kind rules", () => {
    test("a name that differs from its folder warns and a bad folder name is an error", () => {
        const { kind, piece } = scaffolded("skills", "Bad_Name");
        expect(validate(kind, piece).map((issue) => issue.level)).toContain("error");
        const renamed = write(kind, scaffolded("skills").piece.text, "name", "other");
        expect(validate(kind, { ...scaffolded("skills").piece, text: renamed })).toContainEqual(expect.objectContaining({ level: "warn", field: "name" }));
    });

    test("a hook keeps the entries the form does not show, and changing its event moves them", () => {
        const kind = kinds.hooks;
        const text = `${JSON.stringify({ description: "Guard", hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "a" }, { type: "command", command: "b" }] }] } }, null, 4)}\n`;
        const changed = write(kind, write(kind, text, "event", "PostToolUse"), "command", "c");
        expect(JSON.parse(changed)).toEqual({ description: "Guard", hooks: { PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "c" }, { type: "command", command: "b" }] }] } });
        expect(read(kind, changed).values).toMatchObject({ event: "PostToolUse", matcher: "Bash", type: "command", command: "c" });
    });

    test("prompt variables must match the template", () => {
        const kind = kinds.prompts;
        const piece = { ...scaffolded("prompts").piece, text: "---\ndescription: Ticket\nvariables: [jira, org]\n---\nTicket {{jira}} for {{client}}\n" };
        expect(validate(kind, piece).map((issue) => issue.message)).toEqual(["{{client}} is used but not declared", "org is declared but the template never uses it"]);
    });

    test("plugin parts inside .claude-plugin and a missing mod module are errors", () => {
        const plugin = scaffolded("plugins").piece;
        expect(validate(kinds.plugins, { ...plugin, files: [...plugin.files, "plugins/apex-review/.claude-plugin/skills/x/SKILL.md"] })).toContainEqual(expect.objectContaining({ level: "error" }));
        const mod = scaffolded("mods").piece;
        expect(validate(kinds.mods, { ...mod, files: [mod.path] }).map((issue) => issue.message)).toContain("hooks/hooks.json is missing; it names the module to load");
        const reserved = validate(kinds.plugins, { ...plugin, text: plugin.text.replace('"name": "apex-review"', '"name": "claude-tools"') });
        expect(reserved).toContainEqual(expect.objectContaining({ level: "error", message: "claude-tools is a reserved plugin name" }));
    });
});

describe("hooks against the event rules", () => {
    const hook = (hooks: unknown) => ({ kind: "hooks" as const, name: "guard", path: "hooks/guard.json", text: JSON.stringify({ hooks }), files: ["hooks/guard.json"] });

    test("unknown events, unsupported handlers and tool-only rules are errors", () => {
        const messages = validate(kinds.hooks, hook({ PreToolCall: [], SessionStart: [{ hooks: [{ type: "prompt", prompt: "x", if: "Bash(*)" }] }] })).map((issue) => issue.message);
        expect(messages).toContain("PreToolCall is not a hook event");
        expect(messages).toContain("SessionStart does not run prompt handlers");
        expect(messages).toContain("if only works on tool events; this SessionStart hook would never run");
    });

    test("a matcher on an event that takes none is a warning", () => {
        expect(validate(kinds.hooks, hook({ Stop: [{ matcher: "x", hooks: [{ type: "command", command: "y" }] }] }))).toEqual([{ level: "warn", message: "Stop ignores matchers", field: "matcher" }]);
    });

    test("a hooks file without the hooks wrapper is refused", () => {
        expect(validate(kinds.hooks, { ...hook({}), text: JSON.stringify({ PreToolUse: [] }) }).map((issue) => issue.level)).toContain("error");
    });
});
