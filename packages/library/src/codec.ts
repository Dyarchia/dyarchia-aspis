import { type Node, isMap, isScalar, isSeq, parseDocument, stringify } from "yaml";

/*
 * Files are the source of truth and the declarative forms are a view over them. Reading never rewrites anything,
 * and a change made in a form touches only the key it names: comments, key order, formatting and keys the editor
 * does not know about all survive. The body of a markdown piece is kept byte for byte.
 */

export type Value = string | number | boolean | string[] | Record<string, unknown> | unknown[] | null | undefined;

export interface Markdown {
    frontmatter: Record<string, unknown>;
    body: string;
    hasFrontmatter: boolean;
    error?: string;
}

const fence = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(\r?\n|$)/;

function split(text: string) {
    const match = fence.exec(text);
    if (!match) return { head: undefined, body: text };
    return { head: match[1] ?? "", body: text.slice(match[0].length) };
}

export function parseMarkdown(text: string): Markdown {
    const { head, body } = split(text);
    if (head === undefined) return { frontmatter: {}, body, hasFrontmatter: false };
    const doc = parseDocument(head);
    if (doc.errors.length > 0) return { frontmatter: {}, body, hasFrontmatter: true, error: doc.errors[0]!.message };
    const value = doc.toJS();
    if (value !== null && (typeof value !== "object" || Array.isArray(value))) return { frontmatter: {}, body, hasFrontmatter: true, error: "The frontmatter must be a set of keys" };
    return { frontmatter: (value ?? {}) as Record<string, unknown>, body, hasFrontmatter: true };
}

const empty = (value: Value) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

const simple = (value: Value): value is string | number | boolean | string[] =>
    typeof value !== "object" || (Array.isArray(value) && value.every((item) => typeof item === "string"));

const scalarText = (value: string | number | boolean) => stringify(value, { lineWidth: 0 }).trimEnd();
const flowText = (items: string[]) => `[${items.map(scalarText).join(", ")}]`;
const lineStart = (text: string, at: number) => text.lastIndexOf("\n", at - 1) + 1;
const lineEnd = (text: string, at: number) => {
    const end = text.indexOf("\n", at);
    return end < 0 ? text.length : end + 1;
};

/*
 * The edit is spliced into the original text: a scalar or a list of strings replaces exactly the characters of the
 * old value, so the comment after it, the other keys and their formatting stay as they were. Anything richer
 * (nested maps, lists of objects) is rewritten through the YAML document, which only reformats that one key.
 */
function editHead(head: string, key: string, value: Value): string {
    const doc = parseDocument(head);
    if (doc.errors.length > 0) throw new Error(`The frontmatter does not parse: ${doc.errors[0]!.message}`);
    const pair = isMap(doc.contents) ? doc.contents.items.find((item) => isScalar(item.key) && item.key.value === key) : undefined;
    const node = pair?.value as (Node & { flow?: boolean }) | null | undefined;
    const keyRange = (pair?.key as Node | undefined)?.range;
    if (empty(value)) {
        if (!pair || !keyRange) return head;
        const end = node?.range ? node.range[2] : keyRange[2];
        return head.slice(0, lineStart(head, keyRange[0])) + head.slice(lineEnd(head, Math.max(end - 1, keyRange[0])));
    }
    if (simple(value)) {
        const text = Array.isArray(value) ? (node && isSeq(node) && !node.flow ? undefined : flowText(value)) : scalarText(value);
        if (text !== undefined && node?.range && (isScalar(node) || isSeq(node))) return head.slice(0, node.range[0]) + text + head.slice(node.range[1]);
        if (text !== undefined && !pair) return `${head}${head && !head.endsWith("\n") ? "\n" : ""}${key}: ${text}\n`;
    }
    doc.set(key, value);
    return String(doc);
}

/* Sets or clears one frontmatter key. Clearing removes the key; an empty frontmatter keeps its fences. */
export function setFrontmatter(text: string, key: string, value: Value): string {
    const { head, body } = split(text);
    const next = editHead(head ?? "", key, value);
    return `---\n${next}${next && !next.endsWith("\n") ? "\n" : ""}---\n${body}`;
}

export function setBody(text: string, body: string): string {
    const { head } = split(text);
    return head === undefined ? body : `---\n${head}${head && !head.endsWith("\n") ? "\n" : ""}---\n${body}`;
}

export interface Json {
    value: Record<string, unknown>;
    error?: string;
}

export function parseJson(text: string): Json {
    try {
        const value = JSON.parse(text) as unknown;
        if (value === null || typeof value !== "object" || Array.isArray(value)) return { value: {}, error: "The file must hold a JSON object" };
        return { value: value as Record<string, unknown> };
    } catch (error) {
        return { value: {}, error: error instanceof Error ? error.message : String(error) };
    }
}

const indentOf = (text: string) => /\n([ \t]+)"/.exec(text)?.[1] ?? "    ";

/* Rewrites a JSON piece with the same indentation and key order it had, changing only what the form edited. */
export function writeJson(text: string, change: (value: Record<string, unknown>) => void): string {
    const parsed = parseJson(text || "{}");
    if (parsed.error) throw new Error(`The JSON does not parse: ${parsed.error}`);
    change(parsed.value);
    return `${JSON.stringify(parsed.value, null, indentOf(text))}\n`;
}

/* Sets one dotted path (hooks.PreToolUse) in a JSON object, creating objects on the way and dropping empty values. */
export function setPath(value: Record<string, unknown>, path: string, next: Value) {
    const keys = path.split(".");
    let target = value;
    for (const key of keys.slice(0, -1)) {
        if (typeof target[key] !== "object" || target[key] === null || Array.isArray(target[key])) target[key] = {};
        target = target[key] as Record<string, unknown>;
    }
    const last = keys.at(-1)!;
    if (empty(next)) delete target[last];
    else target[last] = next;
}
