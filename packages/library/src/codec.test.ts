import { describe, expect, test } from "bun:test";
import { parseJson, parseMarkdown, setBody, setFrontmatter, setPath, writeJson } from "./codec.ts";

const skill = `---
# Review gate for Apex
name: apex-review
description: Review Apex classes   # keep it short
x-team: salesforce
allowed-tools: [Read, Grep]
---
Review the class.

Keep the body exactly.
`;

describe("markdown pieces", () => {
    test("reading gives the fields and the body without touching anything", () => {
        expect(parseMarkdown(skill)).toEqual({
            frontmatter: { name: "apex-review", description: "Review Apex classes", "x-team": "salesforce", "allowed-tools": ["Read", "Grep"] },
            body: "Review the class.\n\nKeep the body exactly.\n",
            hasFrontmatter: true,
        });
    });

    test("a form change touches only its own line: comments, order and unknown keys survive", () => {
        const changed = setFrontmatter(skill, "description", "Review Apex classes and triggers");
        expect(changed).toBe(skill.replace("description: Review Apex classes   # keep it short", "description: Review Apex classes and triggers   # keep it short"));
        expect(setFrontmatter(changed, "description", "Review Apex classes")).toContain("x-team: salesforce");
    });

    test("lists keep their flow style, new keys go last and cleared keys disappear", () => {
        expect(setFrontmatter(skill, "allowed-tools", ["Read", "Grep", "Glob"])).toContain("allowed-tools: [Read, Grep, Glob]\n");
        expect(setFrontmatter(skill, "model", "sonnet")).toContain('allowed-tools: [Read, Grep]\nmodel: sonnet\n---\n');
        expect(setFrontmatter(skill, "x-team", "")).not.toContain("x-team");
    });

    test("the body is replaced verbatim and a file without frontmatter gains one when a field is set", () => {
        expect(setBody(skill, "New body\n")).toBe(skill.replace("Review the class.\n\nKeep the body exactly.\n", "New body\n"));
        expect(setFrontmatter("Just text\n", "description", "Fix an issue")).toBe("---\ndescription: Fix an issue\n---\nJust text\n");
    });

    test("a long value stays on its own line and reads back as written", () => {
        const long = "Reviews Apex classes and triggers for bulk safety, governor limits and test coverage before a pull request";
        const text = setFrontmatter(skill, "description", long);
        expect(text).toContain(`description: ${long}   # keep it short\n`);
        expect(parseMarkdown(text).frontmatter.description).toBe(long);
    });

    test("broken frontmatter is reported, not guessed at", () => {
        expect(parseMarkdown("---\nname: [unclosed\n---\nbody").error).toBeDefined();
        expect(() => setFrontmatter("---\nname: [unclosed\n---\nbody", "name", "x")).toThrow("does not parse");
    });
});

describe("json pieces", () => {
    test("edits keep indentation and key order", () => {
        const text = '{\n  "name": "hello",\n  "version": "0.1.0",\n  "x-extra": true\n}\n';
        const changed = writeJson(text, (value) => setPath(value, "version", "0.2.0"));
        expect(changed).toBe('{\n  "name": "hello",\n  "version": "0.2.0",\n  "x-extra": true\n}\n');
        expect(writeJson(text, (value) => setPath(value, "hooks.PreToolUse", [{ matcher: "Bash" }]))).toContain('"hooks": {\n    "PreToolUse"');
        expect(writeJson(text, (value) => setPath(value, "x-extra", undefined))).not.toContain("x-extra");
    });

    test("invalid json and non-objects are reported", () => {
        expect(parseJson("{").error).toBeDefined();
        expect(parseJson("[1]").error).toContain("JSON object");
    });
});
