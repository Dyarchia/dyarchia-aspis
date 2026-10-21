import type { Value } from "./codec.ts";
import type { Issue, Kind, KindId } from "./kind.ts";
import { steps as skillsSteps } from "./tutorials/skills.ts";
import { steps as agentsSteps } from "./tutorials/agents.ts";
import { steps as commandsSteps } from "./tutorials/commands.ts";
import { steps as promptsSteps } from "./tutorials/prompts.ts";
import { steps as rulesSteps } from "./tutorials/rules.ts";
import { steps as hooksSteps } from "./tutorials/hooks.ts";
import { steps as pluginsSteps } from "./tutorials/plugins.ts";
import { steps as modsSteps } from "./tutorials/mods.ts";

/*
 * The eight kinds a library holds, in Claude Code's own formats. Fields, limits, lint levels and tutorial steps
 * follow the Claude Code documentation (code.claude.com/docs/en): an error is something Claude Code would refuse,
 * skip or ignore, a warning is style or a field that would be dropped. Anything the docs leave open is not
 * invented here; it stays editable in Code and is kept as written. Prompts have no file format in Claude Code, so
 * they use the smallest one that fits and say so.
 */

const efforts = ["low", "medium", "high", "xhigh", "max"] as const;
const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const truthy = (value: unknown) => value === true || ["true", "yes", "on", "1"].includes(String(value).toLowerCase());
const lineCount = (text: string) => text.split("\n").length;

const fileName = (name: string): Issue[] => (kebab.test(name) ? [] : [{ level: "error", message: `${name} must be lowercase letters, digits and single hyphens` }]);

const inFolder = (folder: string, file: (name: string) => string) => (path: string) => {
    const parts = path.split("/");
    if (parts[0] !== folder || parts.length < 2) return undefined;
    const name = parts[1]!.replace(/\.(md|json)$/, "");
    return path.startsWith(`${folder}/${name}/`) || path === file(name) ? name : undefined;
};

const skillFields = [
    { key: "description", label: "Description", control: "textarea", help: "Claude loads it from this. 1,536 characters together with When to use." },
    { key: "when_to_use", label: "When to use", control: "textarea", help: "Extra trigger phrases, appended to the description." },
    { key: "argument-hint", label: "Argument hint", control: "text", placeholder: "[issue-number]", help: "Shown in autocomplete: what to type after the command." },
    { key: "arguments", label: "Arguments", control: "tags", placeholder: "issue, branch", help: "Named arguments, used in the body as $issue, $branch." },
    { key: "disable-model-invocation", label: "Only when typed", control: "toggle", help: "Claude never starts it on its own." },
    { key: "allowed-tools", label: "Allowed tools", control: "tags", placeholder: "Read, Grep, Bash(git *)", help: "Tools pre-approved while it runs." },
    { key: "disallowed-tools", label: "Denied tools", control: "tags" },
    { key: "model", label: "Model", control: "text", placeholder: "inherit", help: "Any /model value or inherit." },
    { key: "effort", label: "Effort", control: "select", options: efforts },
    { key: "context", label: "Context", control: "select", options: ["fork"], help: "fork runs it in a separate subagent." },
    { key: "agent", label: "Agent", control: "text", placeholder: "general-purpose", help: "The subagent type used with context fork." },
    { key: "shell", label: "Shell", control: "select", options: ["bash", "powershell"], help: "The shell for !`command` lines in the body." },
] as const;

const skills: Kind = {
    id: "skills",
    label: "Skills",
    singular: "skill",
    folder: "skills",
    format: "markdown",
    summary: "Instructions Claude loads when a task matches, or when you type /name.",
    main: (name) => `skills/${name}/SKILL.md`,
    root: (name) => `skills/${name}`,
    owns: inFolder("skills", (name) => `skills/${name}/SKILL.md`),
    scaffold: (name) => ({ [`skills/${name}/SKILL.md`]: `---\nname: ${name}\n---\n\n` }),
    fields: [
        { key: "name", label: "Name", control: "text", help: "Defaults to the folder name." },
        ...skillFields,
        { key: "user-invocable", label: "In the / menu", control: "toggle" },
        { key: "background", label: "Background", control: "toggle", help: "With context fork: off waits for the result." },
        { key: "paths", label: "Paths", control: "tags", placeholder: "src/api/**", help: "Loads on its own only for matching files." },
    ],
    essentials: ["name", "description", "when_to_use", "body"],
    body: { label: "Instructions", help: "$ARGUMENTS, $1, $name take what you typed; !`command` inserts its output." },
    steps: skillsSteps,
    check: (piece, values, body) => {
        const issues = fileName(piece.name);
        if (piece.name.toLowerCase() === "synced" || piece.name.startsWith("anthropic-skills")) issues.push({ level: "error", message: `Claude Code does not load a skill folder named ${piece.name}` });
        if (typeof values.name === "string" && values.name !== piece.name) issues.push({ level: "warn", message: `The command will be /${values.name}, not /${piece.name}`, field: "name" });
        if (!values.description) issues.push({ level: "warn", message: "Without a description Claude uses the first line of the body to decide when to load it", field: "description" });
        const length = String(values.description ?? "").length + String(values.when_to_use ?? "").length;
        if (length > 1536) issues.push({ level: "warn", message: `Description and when to use add up to ${length} characters; Claude Code truncates at 1,536`, field: "description" });
        if ((values.agent || values.background !== undefined) && values.context !== "fork") issues.push({ level: "warn", message: "Agent and background only apply with context fork", field: "context" });
        if (truthy(values["disable-model-invocation"]) && values["user-invocable"] === false) issues.push({ level: "warn", message: "Typed-only and hidden from the menu: nobody can start it", field: "user-invocable" });
        if (lineCount(body) > 500) issues.push({ level: "warn", message: "SKILL.md reads best under 500 lines; move detail into files beside it", field: "body" });
        return issues;
    },
};

const agentName = (value: unknown): Issue[] => {
    if (typeof value !== "string" || !value) return [];
    if (value.startsWith("-") || value.includes(":") || value.length > 256) return [{ level: "error", message: "The name cannot start with -, contain : or pass 256 characters", field: "name" }];
    return [];
};

const agents: Kind = {
    id: "agents",
    label: "Agents",
    singular: "agent",
    folder: "agents",
    format: "markdown",
    summary: "Subagents with their own prompt, tools and model.",
    main: (name) => `agents/${name}.md`,
    root: (name) => `agents/${name}.md`,
    owns: inFolder("agents", (name) => `agents/${name}.md`),
    scaffold: (name) => ({ [`agents/${name}.md`]: `---\nname: ${name}\n---\n\n` }),
    fields: [
        { key: "name", label: "Name", control: "text", required: true, help: "The file name can differ." },
        { key: "description", label: "Description", control: "textarea", required: true, help: "When Claude should hand work to it." },
        { key: "tools", label: "Tools", control: "tags", placeholder: "Read, Glob, Grep", help: "Tools it may use. Empty inherits all of them." },
        { key: "disallowedTools", label: "Denied tools", control: "tags" },
        { key: "permissionMode", label: "Permission mode", control: "select", options: ["default", "acceptEdits", "auto", "dontAsk", "bypassPermissions", "plan", "manual"], help: "How its tool calls are approved." },
        { key: "model", label: "Model", control: "text", placeholder: "inherit", help: "sonnet, opus, haiku, fable, a full model id or inherit." },
        { key: "effort", label: "Effort", control: "select", options: efforts },
        { key: "maxTurns", label: "Max turns", control: "number", help: "The output comes back marked partial when reached." },
        { key: "skills", label: "Skills", control: "tags", help: "Skills preloaded in full when it starts." },
        { key: "memory", label: "Memory", control: "select", options: ["user", "project", "local"], help: "A memory folder it keeps between runs." },
        { key: "isolation", label: "Isolation", control: "select", options: ["worktree"], help: "worktree runs it in a temporary git worktree." },
        { key: "background", label: "Background", control: "toggle" },
        { key: "omitClaudeMd", label: "Skip CLAUDE.md", control: "toggle" },
        { key: "color", label: "Color", control: "select", options: ["red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"] },
        { key: "initialPrompt", label: "Initial prompt", control: "textarea", help: "First turn when it runs as the main agent with --agent." },
    ],
    essentials: ["name", "description", "tools", "model", "body"],
    body: { label: "System prompt", help: "It sees only what it is given, not your conversation." },
    steps: agentsSteps,
    check: (piece, values) => [...fileName(piece.name), ...agentName(values.name)],
};

const commands: Kind = {
    id: "commands",
    label: "Commands",
    singular: "command",
    folder: "commands",
    format: "markdown",
    summary: "Prompts you run as /name, the older form of skills.",
    main: (name) => `commands/${name}.md`,
    root: (name) => `commands/${name}.md`,
    owns: inFolder("commands", (name) => `commands/${name}.md`),
    scaffold: (name) => ({ [`commands/${name}.md`]: "" }),
    fields: skillFields,
    essentials: ["description", "argument-hint", "body"],
    body: { label: "Prompt", help: "$ARGUMENTS, $1, $name take what you typed; !`command` inserts its output." },
    steps: commandsSteps,
    check: (piece, values, body) => {
        const issues = fileName(piece.name);
        const tools = Array.isArray(values["allowed-tools"]) ? values["allowed-tools"].join(" ") : String(values["allowed-tools"] ?? "");
        if (/!`/.test(body) && !/Bash/.test(tools)) issues.push({ level: "warn", message: "The prompt runs !`commands` but Bash is not among the allowed tools", field: "allowed-tools" });
        return issues;
    },
};

const variables = (body: string) => [...new Set([...body.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)].map((match) => match[1]!))];

const prompts: Kind = {
    id: "prompts",
    label: "Prompts",
    singular: "prompt",
    folder: "prompts",
    format: "markdown",
    summary: "Reusable prompt templates with {{variables}}.",
    main: (name) => `prompts/${name}.md`,
    root: (name) => `prompts/${name}.md`,
    owns: inFolder("prompts", (name) => `prompts/${name}.md`),
    scaffold: (name) => ({ [`prompts/${name}.md`]: "" }),
    fields: [
        { key: "description", label: "Description", control: "textarea", required: true },
        { key: "variables", label: "Variables", control: "tags", placeholder: "jira, org", help: "The {{names}} the template expects." },
    ],
    essentials: ["description", "variables", "body"],
    body: { label: "Template", help: "Write {{name}} where a variable goes." },
    steps: promptsSteps,
    check: (piece, values, body) => {
        const declared = Array.isArray(values.variables) ? values.variables.map(String) : [];
        const used = variables(body);
        return [
            ...fileName(piece.name),
            ...used.filter((name) => !declared.includes(name)).map((name): Issue => ({ level: "warn", message: `{{${name}}} is used but not declared`, field: "variables" })),
            ...declared.filter((name) => !used.includes(name)).map((name): Issue => ({ level: "warn", message: `${name} is declared but the template never uses it`, field: "variables" })),
        ];
    },
};

const rules: Kind = {
    id: "rules",
    label: "Rules",
    singular: "rule",
    folder: "rules",
    format: "markdown",
    summary: "Standing instructions for CLAUDE.md, AGENTS.md or .claude/rules.",
    main: (name) => `rules/${name}.md`,
    root: (name) => `rules/${name}.md`,
    owns: inFolder("rules", (name) => `rules/${name}.md`),
    scaffold: (name) => ({ [`rules/${name}.md`]: "" }),
    fields: [{ key: "paths", label: "Paths", control: "tags", placeholder: "src/api/**/*.ts", help: "Loads only for matching files. Empty: always loads." }],
    essentials: ["paths", "body"],
    body: { label: "Rules", help: "@path imports another file." },
    steps: rulesSteps,
    check: (piece, _values, body) => {
        const issues = fileName(piece.name);
        if (!body.trim()) issues.push({ level: "error", message: "The rule is empty", field: "body" });
        if (lineCount(body) > 200) issues.push({ level: "warn", message: "Memory files work best under 200 lines", field: "body" });
        return issues;
    },
};

export const hookEvents = [
    "SessionStart",
    "Setup",
    "UserPromptSubmit",
    "UserPromptExpansion",
    "PreToolUse",
    "PermissionRequest",
    "PermissionDenied",
    "PostToolUse",
    "PostToolUseFailure",
    "PostToolBatch",
    "Notification",
    "MessageDisplay",
    "SubagentStart",
    "SubagentStop",
    "TaskCreated",
    "TaskCompleted",
    "Stop",
    "StopFailure",
    "TeammateIdle",
    "InstructionsLoaded",
    "ConfigChange",
    "CwdChanged",
    "DirectoryAdded",
    "FileChanged",
    "WorktreeCreate",
    "WorktreeRemove",
    "PreCompact",
    "PostCompact",
    "PreModelSwitch",
    "PostModelSwitch",
    "Elicitation",
    "ElicitationResult",
    "SessionEnd",
] as const;

const allHandlers = ["PermissionDenied", "PostToolBatch", "PostToolUse", "PostToolUseFailure", "PreToolUse", "Stop", "SubagentStop", "TaskCompleted", "TaskCreated", "TeammateIdle", "UserPromptExpansion", "UserPromptSubmit"];
const unmatched = ["UserPromptSubmit", "PostToolBatch", "Stop", "TeammateIdle", "TaskCreated", "TaskCompleted", "WorktreeCreate", "WorktreeRemove", "MessageDisplay", "CwdChanged"];
const toolEvents = ["PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest", "PermissionDenied"];

/* Which handler types Claude Code runs on an event. */
export function handlersFor(event: string): string[] {
    if (allHandlers.includes(event)) return ["command", "http", "mcp_tool", "prompt", "agent"];
    if (event === "PermissionRequest") return ["command", "http", "mcp_tool", "prompt"];
    if (event === "SessionStart" || event === "Setup") return ["command", "mcp_tool"];
    return ["command", "http", "mcp_tool"];
}

type Entry = { matcher?: string; hooks?: Record<string, unknown>[] };

/* A hook piece is a plugin hooks.json. The form edits its first event's first handler; the rest stays as written. */
const hookAdapter = {
    known: ["description", "hooks"],
    get(value: Record<string, unknown>, key: string): unknown {
        const events = (value.hooks ?? {}) as Record<string, Entry[]>;
        const event = Object.keys(events)[0];
        const entry = event ? events[event]?.[0] : undefined;
        if (key === "description") return value.description;
        if (key === "event") return event;
        if (key === "matcher") return entry?.matcher;
        return entry?.hooks?.[0]?.[key];
    },
    set(value: Record<string, unknown>, key: string, next: Value) {
        const clear = next === undefined || next === null || next === "";
        if (key === "description") {
            if (clear) delete value.description;
            else value.description = next;
            return;
        }
        const events = (value.hooks ??= {}) as Record<string, Entry[]>;
        const event = Object.keys(events)[0] ?? "PreToolUse";
        if (key === "event") {
            if (clear || next === event) return;
            const entries = events[event] ?? [{ hooks: [{ type: "command" }] }];
            value.hooks = Object.fromEntries([[String(next), entries], ...Object.entries(events).filter(([name]) => name !== event)]);
            return;
        }
        const entry = ((events[event] ??= [{}])[0] ??= {});
        if (key === "matcher") {
            if (clear) delete entry.matcher;
            else entry.matcher = String(next);
            return;
        }
        const handler = ((entry.hooks ??= [{}])[0] ??= {});
        if (clear) delete handler[key];
        else handler[key] = next;
    },
};

const hooks: Kind = {
    id: "hooks",
    label: "Hooks",
    singular: "hook",
    folder: "hooks",
    format: "json",
    summary: "What runs at a point of Claude's work: before a tool, after an edit, when a turn ends.",
    main: (name) => `hooks/${name}.json`,
    root: (name) => `hooks/${name}.json`,
    owns: inFolder("hooks", (name) => `hooks/${name}.json`),
    scaffold: (name) => ({ [`hooks/${name}.json`]: `${JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command" }] }] } }, null, 4)}\n` }),
    adapter: hookAdapter,
    fields: [
        { key: "description", label: "Description", control: "text" },
        { key: "event", label: "Event", control: "select", options: hookEvents, required: true, help: "PreToolUse can block a tool call; Stop runs when Claude ends its turn." },
        { key: "matcher", label: "Matcher", control: "text", placeholder: "Edit|Write", help: "Tool name for tool events, source for SessionStart. Empty or * matches all." },
        { key: "if", label: "If", control: "text", placeholder: "Bash(git *)", help: "Tool events only: a single permission rule the call must match." },
        { key: "type", label: "Handler", control: "select", options: ["command", "http", "mcp_tool", "prompt", "agent"], required: true, help: "command runs a shell command, http posts to a URL, prompt or agent ask a model." },
        { key: "command", label: "Command", control: "text", placeholder: "${CLAUDE_PROJECT_DIR}/.claude/hooks/check.sh", help: "Gets the event as JSON on stdin. Exit 0 continues, 2 blocks with stderr as the reason." },
        { key: "url", label: "URL", control: "text", help: "For http handlers." },
        { key: "prompt", label: "Prompt", control: "textarea", help: "For prompt and agent handlers. $ARGUMENTS is the event JSON." },
        { key: "timeout", label: "Timeout (s)", control: "number", help: "Seconds before it is stopped. Defaults: 600 for commands, 30 for prompts." },
        { key: "statusMessage", label: "Status message", control: "text", help: "Shown while it runs." },
    ],
    essentials: ["description", "event", "matcher", "type", "command", "url", "prompt"],
    steps: hooksSteps,
    check: (piece, values, _body) => {
        const issues = fileName(piece.name);
        let json: Record<string, unknown> = {};
        try {
            json = JSON.parse(piece.text) as Record<string, unknown>;
        } catch {
            return issues;
        }
        if (typeof json.hooks !== "object" || json.hooks === null) return [...issues, { level: "error", message: "A plugin hooks file needs its events inside a hooks object" }];
        for (const [event, entries] of Object.entries(json.hooks as Record<string, Entry[]>)) {
            if (!(hookEvents as readonly string[]).includes(event)) {
                issues.push({ level: "error", message: `${event} is not a hook event`, field: "event" });
                continue;
            }
            for (const entry of Array.isArray(entries) ? entries : []) {
                if (entry.matcher && unmatched.includes(event)) issues.push({ level: "warn", message: `${event} ignores matchers`, field: "matcher" });
                if (entry.matcher?.startsWith("mcp__") && !entry.matcher.includes(".*") && !entry.matcher.includes("__", 5)) issues.push({ level: "warn", message: `${entry.matcher} matches nothing; add .* after the server`, field: "matcher" });
                for (const handler of entry.hooks ?? []) {
                    const type = String(handler.type ?? "");
                    if (!type) issues.push({ level: "error", message: `A ${event} handler has no type`, field: "type" });
                    else if (!handlersFor(event).includes(type)) issues.push({ level: "error", message: `${event} does not run ${type} handlers`, field: "type" });
                    if (type === "command" && !handler.command) issues.push({ level: "error", message: "A command handler needs its command", field: "command" });
                    if (type === "http" && !handler.url) issues.push({ level: "error", message: "An http handler needs its url", field: "url" });
                    if (type === "mcp_tool" && (!handler.server || !handler.tool)) issues.push({ level: "error", message: "An mcp_tool handler needs server and tool" });
                    if ((type === "prompt" || type === "agent") && !handler.prompt) issues.push({ level: "error", message: `A ${type} handler needs its prompt`, field: "prompt" });
                    if (handler.if && !toolEvents.includes(event)) issues.push({ level: "error", message: `if only works on tool events; this ${event} hook would never run`, field: "if" });
                    if (handler.timeout !== undefined && !Number.isInteger(handler.timeout)) issues.push({ level: "error", message: "The timeout is whole seconds", field: "timeout" });
                }
            }
        }
        return issues;
    },
};

const reserved = /^(claude-|anthropic-|anthropics-|cc-plugin-)|^(claude|anthropic|anthropics|claude-code|claude-mods)$/;

const manifestFields = [
    { key: "name", label: "Name", control: "text", required: true, help: "How it is installed. Kebab-case, no spaces, @, : or slashes." },
    { key: "displayName", label: "Display name", control: "text" },
    { key: "version", label: "Version", control: "text", placeholder: "1.0.0", help: "Setting it pins users to that version until you change it." },
    { key: "description", label: "Description", control: "textarea" },
    { key: "author", label: "Author", control: "text", path: "author.name" },
    { key: "authorEmail", label: "Author email", control: "text", path: "author.email" },
] as const;

const manifestIssues = (piece: { name: string }, values: Record<string, unknown>): Issue[] => {
    const issues = fileName(piece.name);
    const name = String(values.name ?? "");
    if (!name) return issues;
    if (/[\s@:/\\]/.test(name)) issues.push({ level: "error", message: "The name cannot hold spaces, @, : or slashes", field: "name" });
    if (reserved.test(name) || /\b(claude|anthropic)\b.*\bofficial\b|\bofficial\b.*\b(claude|anthropic)\b/.test(name)) issues.push({ level: "error", message: `${name} is a reserved plugin name`, field: "name" });
    else if (!kebab.test(name)) issues.push({ level: "warn", message: "Plugin names read best in kebab-case", field: "name" });
    if (!values.version) issues.push({ level: "warn", message: "Without a version users cannot tell releases apart", field: "version" });
    if (!values.description) issues.push({ level: "warn", message: "Add a description", field: "description" });
    return issues;
};

const plugins: Kind = {
    id: "plugins",
    label: "Plugins",
    singular: "plugin",
    folder: "plugins",
    format: "json",
    summary: "Skills, agents, hooks and servers that install together.",
    main: (name) => `plugins/${name}/.claude-plugin/plugin.json`,
    root: (name) => `plugins/${name}`,
    owns: inFolder("plugins", (name) => `plugins/${name}/.claude-plugin/plugin.json`),
    scaffold: (name) => ({ [`plugins/${name}/.claude-plugin/plugin.json`]: `${JSON.stringify({ name, version: "1.0.0" }, null, 4)}\n` }),
    fields: [
        ...manifestFields,
        { key: "homepage", label: "Homepage", control: "text" },
        { key: "repository", label: "Repository", control: "text" },
        { key: "license", label: "License", control: "text", placeholder: "MIT", help: "SPDX identifier." },
        { key: "keywords", label: "Keywords", control: "tags" },
    ],
    essentials: ["name", "displayName", "version", "description"],
    steps: pluginsSteps,
    check: (piece, values) => {
        const issues = manifestIssues(piece, values);
        if (values.homepage && !URL.canParse(String(values.homepage))) issues.push({ level: "error", message: "The homepage is not a URL", field: "homepage" });
        const misplaced = piece.files.filter((file) => file.includes("/.claude-plugin/") && !file.endsWith("/.claude-plugin/plugin.json") && !file.endsWith("/.claude-plugin/marketplace.json"));
        for (const file of misplaced) issues.push({ level: "error", message: `${file} belongs at the plugin root, not inside .claude-plugin` });
        if (piece.files.includes(`plugins/${piece.name}/CLAUDE.md`)) issues.push({ level: "warn", message: "A CLAUDE.md at the plugin root is not loaded" });
        return issues;
    },
};

const register = `import type { Register } from "claude-code";

export const register: Register = (on) => {
    on("tool.call", { tool: "Bash" }, async ($, e, next) => next(e));
};
`;

const mods: Kind = {
    id: "mods",
    label: "Mods",
    singular: "mod",
    folder: "mods",
    format: "json",
    summary: "Plugins whose code runs inside Claude Code.",
    main: (name) => `mods/${name}/.claude-plugin/plugin.json`,
    root: (name) => `mods/${name}`,
    owns: inFolder("mods", (name) => `mods/${name}/.claude-plugin/plugin.json`),
    scaffold: (name) => ({
        [`mods/${name}/.claude-plugin/plugin.json`]: `${JSON.stringify({ name, version: "1.0.0" }, null, 4)}\n`,
        [`mods/${name}/hooks/hooks.json`]: `${JSON.stringify({ modules: ["./register.ts"] }, null, 4)}\n`,
        [`mods/${name}/hooks/register.ts`]: register,
    }),
    fields: manifestFields,
    essentials: ["name", "displayName", "version", "description"],
    steps: modsSteps,
    check: (piece, values) => {
        const issues = manifestIssues(piece, values);
        if (!piece.files.includes(`mods/${piece.name}/hooks/hooks.json`)) issues.push({ level: "error", message: "hooks/hooks.json is missing; it names the module to load" });
        return issues;
    },
};

export const kinds: Record<KindId, Kind> = { skills, agents, commands, prompts, rules, hooks, plugins, mods };

/* Which piece a library file belongs to, if any. */
export function pieceAt(path: string): { kind: KindId; name: string } | undefined {
    const kind = kinds[path.split("/")[0] as KindId];
    const name = kind?.owns(path);
    return kind && name ? { kind: kind.id, name } : undefined;
}
