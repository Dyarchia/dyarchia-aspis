import { type Value, parseJson, parseMarkdown, setBody, setFrontmatter, setPath, writeJson } from "./codec.ts";

export const kindIds = ["skills", "agents", "commands", "prompts", "rules", "hooks", "plugins", "mods"] as const;
export type KindId = (typeof kindIds)[number];

export type Control = "text" | "textarea" | "select" | "toggle" | "number" | "tags" | "json";

export interface Field {
    key: string;
    label: string;
    control: Control;
    help?: string;
    required?: boolean;
    options?: readonly string[];
    placeholder?: string;
    path?: string;
}

export interface Step {
    title: string;
    text: string;
    fields: readonly string[];
    source: string;
}

export interface Issue {
    level: "error" | "warn";
    message: string;
    field?: string;
}

export interface Piece {
    kind: KindId;
    name: string;
    path: string;
    text: string;
    files: readonly string[];
}

export interface Kind {
    id: KindId;
    label: string;
    singular: string;
    folder: string;
    format: "markdown" | "json";
    summary: string;
    intro: string;
    main: (name: string) => string;
    root: (name: string) => string;
    owns: (path: string) => string | undefined;
    scaffold: (name: string) => Record<string, string>;
    fields: readonly Field[];
    essentials: readonly string[];
    body?: { label: string; help?: string };
    steps: readonly Step[];
    check?: (piece: Piece, values: Record<string, unknown>, body: string) => Issue[];
    adapter?: Adapter;
}

/* For JSON kinds whose fields do not sit at fixed paths (a hook's event is a key, not a value). */
export interface Adapter {
    get: (value: Record<string, unknown>, key: string) => unknown;
    set: (value: Record<string, unknown>, key: string, next: Value) => void;
    known: readonly string[];
}

export interface Reading {
    values: Record<string, unknown>;
    body: string;
    extra: string[];
    error?: string;
}

const at = (value: Record<string, unknown>, path: string): unknown =>
    path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), value);

/* Reads a piece's main file into the values its form shows, plus the keys the form does not know. */
export function read(kind: Kind, text: string): Reading {
    if (kind.format === "markdown") {
        const parsed = parseMarkdown(text);
        const known = new Set(kind.fields.map((field) => field.key));
        return {
            values: Object.fromEntries(kind.fields.map((field) => [field.key, parsed.frontmatter[field.key]])),
            body: parsed.body,
            extra: Object.keys(parsed.frontmatter).filter((key) => !known.has(key)),
            error: parsed.error,
        };
    }
    const parsed = parseJson(text);
    const roots = new Set(kind.adapter?.known ?? kind.fields.map((field) => (field.path ?? field.key).split(".")[0]!));
    const get = (key: string, path: string) => (kind.adapter ? kind.adapter.get(parsed.value, key) : at(parsed.value, path));
    return {
        values: Object.fromEntries(kind.fields.map((field) => [field.key, get(field.key, field.path ?? field.key)])),
        body: "",
        extra: Object.keys(parsed.value).filter((key) => !roots.has(key)),
        error: parsed.error,
    };
}

/* Applies one form change to the file text, touching nothing else. */
export function write(kind: Kind, text: string, key: string, value: Value): string {
    if (key === "body") return setBody(text, String(value ?? ""));
    const field = kind.fields.find((candidate) => candidate.key === key);
    if (!field) throw new Error(`${kind.singular} has no field ${key}`);
    if (kind.format === "markdown") return setFrontmatter(text, key, value);
    return writeJson(text, (json) => (kind.adapter ? kind.adapter.set(json, key, value) : setPath(json, field.path ?? key, value)));
}

const blank = (value: unknown) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

export function validate(kind: Kind, piece: Piece): Issue[] {
    const reading = read(kind, piece.text);
    if (reading.error) return [{ level: "error", message: `${piece.path} does not parse: ${reading.error}` }];
    const issues: Issue[] = [];
    for (const field of kind.fields) {
        const value = reading.values[field.key];
        if (field.required && blank(value)) issues.push({ level: "error", message: `${field.label} is required`, field: field.key });
        if (field.control === "select" && field.options && !blank(value) && !field.options.includes(String(value)))
            issues.push({ level: "warn", message: `${field.label} "${String(value)}" is not one of ${field.options.join(", ")}`, field: field.key });
        if (field.control === "toggle" && !blank(value) && typeof value !== "boolean") issues.push({ level: "error", message: `${field.label} must be true or false`, field: field.key });
        if (field.control === "number" && !blank(value) && typeof value !== "number") issues.push({ level: "error", message: `${field.label} must be a number`, field: field.key });
    }
    return [...issues, ...(kind.check?.(piece, reading.values, reading.body) ?? [])];
}
