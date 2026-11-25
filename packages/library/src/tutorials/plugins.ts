import { type Step, docs } from "../kind.ts";

const manifest = `{
    "name": "apex-toolkit",
    "displayName": "Apex Toolkit",
    "version": "1.1.0",
    "description": "Reviews Apex for governor limit risks, writes test classes and formats Apex after every edit",
    "author": {
        "name": "Acme Salesforce Team",
        "email": "salesforce-team@example.com"
    },
    "homepage": "https://github.com/acme/apex-toolkit#readme",
    "repository": "https://github.com/acme/apex-toolkit",
    "license": "MIT",
    "keywords": ["salesforce", "apex", "code-review", "testing"]
}`;

export const steps: readonly Step[] = [
    {
        title: "What is a plugin?",
        text: "A plugin is a folder of Claude Code pieces that installs, updates and loads as one unit.",
        body: [
            "A plugin packages skills, agents, hooks, MCP servers and a few other components into one directory, plus a small manifest, `plugin.json`, that gives the bundle its name. Claude Code loads the whole folder together, so a teammate gets your entire setup with one install instead of copying files by hand.",
            "Everything inside is namespaced by the plugin name. A skill folder `apex-review` in a plugin called `apex-toolkit` runs as `/apex-toolkit:apex-review`, and an agent appears as `apex-toolkit:<agent>`. That prefix lets two plugins ship a skill with the same name without colliding.",
            "In this library a plugin lives under `plugins/<name>/`. The manifest sits in `.claude-plugin/plugin.json`, and every component sits in its own folder at the plugin root, beside `.claude-plugin`, never inside it.",
            "Choose a plugin when you want to share several pieces with a team, install them in many projects or ship versioned releases. A skill or hook that only you use works fine on its own. If you need code that runs inside Claude Code and draws in its interface, that is a mod: a plugin with a hooks module.",
        ],
        example: {
            file: "plugins/apex-toolkit/",
            lang: "text",
            code: `apex-toolkit/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── apex-review/
│       └── SKILL.md
├── agents/
│   └── apex-test-writer.md
├── hooks/
│   └── hooks.json
└── scripts/
    └── format-apex.sh`,
            note: "The running example of this tutorial: a Salesforce toolkit with one skill, one agent and one hook.",
        },
        pitfalls: [
            "An enabled plugin is part of every session: the name and description of each skill and agent Claude can invoke on its own sit in context on every turn, so a bloated plugin costs tokens even when nothing in it runs.",
        ],
        fields: [],
        source: docs("plugins/overview#understand-what-a-plugin-is"),
    },
    {
        title: "How is the plugin folder laid out?",
        text: "Each kind of component has a fixed folder at the plugin root, and only the manifest goes inside `.claude-plugin`.",
        body: [
            "Claude Code looks for components in default places under the plugin root: `skills/` with one `<name>/SKILL.md` folder per skill, `agents/` with one Markdown file per subagent, `hooks/hooks.json` for hooks and `.mcp.json` for MCP servers. Create only the folders you use; none of them is required.",
            "The `.claude-plugin/` folder holds `plugin.json` and nothing else. A `skills` or `hooks` folder saved in there does not load, which is one of the most common reasons a plugin loads but looks empty.",
            "`commands/` still works for flat Markdown commands, but it is the older format. Write new ones as skills: they run by name the same way and can carry supporting files in their own folder.",
        ],
        example: {
            file: "shell",
            lang: "bash",
            code: "mkdir -p apex-toolkit/.claude-plugin apex-toolkit/skills/apex-review apex-toolkit/agents apex-toolkit/hooks apex-toolkit/scripts",
            note: "Every folder except `.claude-plugin` sits directly under `apex-toolkit/`.",
        },
        pitfalls: [
            "Putting `skills/` or `hooks/` inside `.claude-plugin/`: components there do not load.",
            "Adding a `CLAUDE.md` at the plugin root: it is not loaded as context, so put standing instructions in a skill.",
        ],
        fields: [],
        source: docs("plugins/create#plugin-layout"),
    },
    {
        title: "What should the plugin be called?",
        text: "The `name` is the only required manifest field: it identifies the plugin and prefixes every component in it.",
        body: [
            "Use kebab-case for `name`, such as `apex-toolkit`. It cannot contain spaces, `@`, `:` or path separators, and `claude plugin validate` warns on other casing. Users install, enable and configure the plugin as `name@marketplace`, so treat the name as permanent: a renamed plugin is a different plugin to every existing install.",
            "Some names are reserved because they would pass as Anthropic's own. A name that starts with `claude-`, `anthropic-`, `anthropics-` or `cc-plugin-` is an error, so are `claude`, `claude-code` and `claude-mods`, and so is putting `official` beside `claude` or `anthropic`.",
            "`displayName` is the label shown in the interface in place of `name`. It can hold spaces and any casing, and it is never used for namespacing or lookup, so you can polish it later without breaking anything.",
        ],
        example: {
            file: "plugins/apex-toolkit/.claude-plugin/plugin.json",
            lang: "json",
            code: `{
    "name": "apex-toolkit",
    "displayName": "Apex Toolkit"
}`,
            note: "This is already a valid manifest: every other field is optional.",
        },
        pitfalls: [
            "Renaming the plugin after people installed it: they stay on the old name, which is now a different plugin.",
            "A name such as `claude-apex-tools` fails validation as reserved.",
        ],
        fields: ["name", "displayName"],
        source: docs("plugins/manifest-reference#name"),
    },
    {
        title: "How do you describe it and credit yourself?",
        text: "A short description and an author tell people what they are installing and who stands behind it.",
        body: [
            "`description` is the text users see for your plugin in `/plugin`. Write one sentence about what the plugin gives them, in their terms: what it reviews, writes or guards, not how it is built.",
            "`author` is an object. Inside it `name` is required, while `email` and `url` are optional. The form writes your name to `author.name` and your email to `author.email`, so the JSON keeps the shape Claude Code expects.",
            "Neither field changes how the plugin behaves, but `claude plugin validate` warns when `description` or `author` is missing, and a plugin without them reads as unfinished to whoever finds it.",
        ],
        example: {
            file: "plugins/apex-toolkit/.claude-plugin/plugin.json",
            lang: "json",
            code: `{
    "name": "apex-toolkit",
    "displayName": "Apex Toolkit",
    "description": "Reviews Apex for governor limit risks, writes test classes and formats Apex after every edit",
    "author": {
        "name": "Acme Salesforce Team",
        "email": "salesforce-team@example.com"
    }
}`,
        },
        pitfalls: ["Writing `author` as a plain string: the field is an object, and a type mismatch fails validation."],
        fields: ["description", "author", "authorEmail"],
        source: docs("plugins/create#create-your-first-plugin"),
    },
    {
        title: "When should you set a version?",
        text: "Setting `version` pins users to that release until you change the string, so either bump it on every release or leave it out.",
        body: [
            "Claude Code decides whether a user needs an update by comparing versions. When `plugin.json` sets `version`, that string comes first, and users keep their cached copy until it changes. Push new commits without touching it and nobody receives them: `claude plugin update` reports the plugin is already at the latest version.",
            "You have two sound options. Bump `version` on every release, for example from `1.0.0` to `1.1.0`. Or leave it out of both `plugin.json` and the marketplace entry, and in a git-hosted marketplace Claude Code uses the commit SHA, so users follow your commits.",
            "The string is not checked against semver, but semver is still the clearest signal for users. Set it in one place only: if the marketplace entry declares a version too, Claude Code uses the manifest's without warning and validation reports the mismatch.",
        ],
        example: {
            file: "plugins/apex-toolkit/.claude-plugin/plugin.json",
            lang: "json",
            code: `{
    "name": "apex-toolkit",
    "version": "1.1.0"
}`,
            note: "Bump the string in the same commit as the change you want users to receive.",
        },
        pitfalls: [
            "Forgetting to bump `version`: installed users keep the old cached copy.",
            "Declaring a version in both `plugin.json` and the marketplace entry.",
        ],
        fields: ["version"],
        source: docs("plugins/host-marketplace#release-a-new-version"),
    },
    {
        title: "How do skills and agents join the plugin?",
        text: "Save them under `skills/` and `agents/` at the plugin root, and they load with the plugin under its name.",
        body: [
            "Each skill is a folder under `skills/` holding a `SKILL.md`. Its command is the plugin name plus the folder name, so `skills/apex-review/SKILL.md` becomes `/apex-toolkit:apex-review`. Claude also reads the skill's `description` and loads it on its own when a request matches, unless the frontmatter turns that off.",
            "Each agent is one Markdown file under `agents/`: the frontmatter names it and says when to use it, and the body is its system prompt. Inside the plugin it is called `apex-toolkit:apex-test-writer`. Plugin agents ignore `permissionMode`, `hooks` and `mcpServers` in their frontmatter, so ship those as plugin hooks and servers instead.",
            "You add these files in Code. Their format is exactly the one you use for standalone skills and agents; only their location and their prefixed names change.",
        ],
        example: {
            file: "plugins/apex-toolkit/skills/apex-review/SKILL.md",
            lang: "markdown",
            code: `---
description: Reviews Apex classes and triggers for governor limit risks. Use when asked to review Apex code or before a deploy.
---

Review the changed .cls and .trigger files. Report SOQL queries or DML statements inside loops first, then logic that is not bulkified, then classes that have no matching test class.`,
            note: "With no `name` in the frontmatter, the folder name sets the command: `/apex-toolkit:apex-review`.",
        },
        pitfalls: [
            "Typing `/apex-review` after loading the plugin: every plugin skill carries the plugin prefix.",
            "Putting `hooks` or `mcpServers` in a plugin agent's frontmatter: they are ignored.",
        ],
        fields: [],
        source: docs("plugins/components#skills"),
    },
    {
        title: "How do hooks and servers find the plugin's own files?",
        text: "Refer to bundled scripts through `${CLAUDE_PLUGIN_ROOT}`, because you never know where the plugin will be installed.",
        body: [
            "Plugin hooks live in `hooks/hooks.json`, under a top-level `hooks` key, in the same shape as the `hooks` object of a settings file. Claude Code registers them when a session loads the plugin, and they fire on their events from then on, whether or not anyone uses the plugin's skills. Narrow the `matcher` to limit when they run.",
            "An installed plugin sits in a versioned cache folder, so a fixed path breaks on the next update. `${CLAUDE_PLUGIN_ROOT}` expands to the installed copy, for scripts and config you ship. `${CLAUDE_PLUGIN_DATA}` is a folder that survives updates, for caches and installed dependencies. Never write state under the plugin root.",
            "A hook `command` without `args` runs through a shell, so wrap the expanded path in double quotes to keep it one word. MCP servers go in `.mcp.json` at the root and accept the same variables in `command`, `args` and `env`.",
        ],
        example: {
            file: "plugins/apex-toolkit/hooks/hooks.json",
            lang: "json",
            code: `{
    "hooks": {
        "PostToolUse": [
            {
                "matcher": "Write|Edit",
                "hooks": [
                    {
                        "type": "command",
                        "command": "\\"\${CLAUDE_PLUGIN_ROOT}/scripts/format-apex.sh\\""
                    }
                ]
            }
        ]
    }
}`,
            note: "The escaped quotes around the path keep it one shell word even when the install path contains spaces.",
        },
        pitfalls: [
            "Hardcoding a path from your own machine: it breaks as soon as someone else installs the plugin.",
            "Keeping the same hook in your settings and in the plugin: hooks carry no prefix, so it runs twice.",
        ],
        fields: [],
        source: docs("plugins/components#reference-plugin-paths-and-store-data"),
    },
    {
        title: "How do people find and trust it?",
        text: "Homepage, repository, license and keywords are what someone reads before deciding to install your plugin.",
        body: [
            "`homepage` points to the plugin's documentation, and it is checked strictly: if it does not parse as a URL, the plugin fails to load. Always write the full address with `https://`.",
            "`repository` is the source URL. It is not validated, but it is where a careful user goes to read your code first, and that matters because a plugin runs with the permissions of whoever installs it.",
            "`license` takes an SPDX identifier such as `MIT` or `Apache-2.0`. `keywords` is a list of discovery tags: pick the words a Salesforce developer would look for, such as `salesforce`, `apex` and `code-review`.",
        ],
        example: {
            file: "plugins/apex-toolkit/.claude-plugin/plugin.json",
            lang: "json",
            code: manifest,
            note: "The finished manifest of the running example, every field of this form filled in.",
        },
        pitfalls: ["A homepage written as `github.com/acme/apex-toolkit`, without the scheme, does not parse as a URL and stops the plugin from loading."],
        fields: ["homepage", "repository", "license", "keywords"],
        source: docs("plugins/manifest-reference#fields"),
    },
    {
        title: "How do you try, test and debug it?",
        text: "Validate the folder, load it for one session with `--plugin-dir`, and read the `/plugin` Errors tab when something is missing.",
        body: [
            "Start with `claude plugin validate` on the plugin folder. It checks the manifest and the frontmatter of every skill, agent and command, and either passes or names each field to fix. Add `--strict` in CI so that warnings, such as a missing version, fail the run too.",
            "Then start `claude --plugin-dir` with the plugin folder, the one that holds `.claude-plugin/`. The plugin loads for that session only, with no install and nothing written to your settings. After you edit its files, run `/reload-plugins` in the session to pick up the changes.",
            "When something does not show up, open `/plugin`. The Installed tab lists the components Claude Code found, and the Errors tab says what failed and why, such as a manifest path that does not exist. For a hook, trigger its event and read the debug log; for an MCP server, check `/mcp`.",
        ],
        example: {
            file: "shell",
            lang: "bash",
            code: `claude plugin validate --strict ./plugins/apex-toolkit
claude --plugin-dir ./plugins/apex-toolkit`,
            note: "Inside the session, type `/apex-toolkit:apex-review` to confirm the skill loaded.",
        },
        pitfalls: [
            "Editing files and testing in the same session without `/reload-plugins`: the session keeps what it loaded at startup.",
            "Testing an installed copy while you edit the source: installs are cached by version, so your edits never reach it.",
        ],
        fields: [],
        source: docs("plugins/create#test-and-debug"),
    },
];
