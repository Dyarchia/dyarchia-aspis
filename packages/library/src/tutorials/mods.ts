import { type Step, docs } from "../kind.ts";

const guard = String.raw`on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!DEPLOY.test(e.command) || !PROD.test(e.command)) return next(e)
    held += 1
    let answer = 'Refuse'
    try {
        answer = await $.ui.ask('Deploy to production? ' + e.command, ['Deploy', 'Refuse'])
    } catch {
        answer = 'Refuse'
    }
    if (answer !== 'Deploy') {
        return { deny: 'The user declined this production deploy. Validate it with --dry-run against a sandbox instead.' }
    }
    return next(e)
})`;

const indent = (code: string) =>
    code
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");

const whole = String.raw`const DEPLOY = /\bsf\s+project\s+deploy\s+start\b/
const PROD = /(--target-org|-o)\s+\S*prod/i
let held = 0

export function register(on) {
    on('session.start', async ($, e, next) => {
        await $.command.register({ name: 'deploys', description: 'Show how many production deploys were held' })
        return next(e)
    })

` +
    indent(guard) +
    String.raw`

    on('command.run', { command: 'deploys' }, async () => {
        return { text: held + ' production deploys held for approval since this mod loaded' }
    })
}`;

export const steps: readonly Step[] = [
    {
        title: "What is a mod?",
        text: "A mod is a plugin with code: JavaScript or TypeScript functions that Claude Code calls from inside its own process when events happen.",
        body: [
            "Claude Code fires an event each time it is about to act: a tool call, a submitted prompt, a request to the model, a part of the interface being drawn. A mod registers functions, called hooks, on those events. Each hook runs before Claude Code acts, so it can watch the event, change it, or handle it itself.",
            "That reaches further than the pieces around it. A settings hook runs a script from outside and mostly blocks, allows or logs. A mod can also draw panes, add commands that run without a Claude turn, send a request to another model, and share data between its hooks through plain variables in its file.",
            "In this library a mod lives under `mods/<name>/`: the manifest in `.claude-plugin/plugin.json`, and a `hooks/` folder with `hooks.json` and the module itself. It installs and updates like any other plugin.",
            "Reach for a mod only when a settings hook, a skill or an MCP server cannot do the job. A mod runs with the user's permissions and is not sandboxed, so every mod you write is code people have to trust.",
        ],
        example: {
            file: "mods/deploy-guard/",
            lang: "text",
            code: `deploy-guard/
├── .claude-plugin/
│   └── plugin.json
└── hooks/
    ├── hooks.json
    └── register.ts`,
            note: "The running example of this tutorial: a mod that asks before Claude deploys Salesforce metadata to a production org.",
        },
        pitfalls: ["Writing a mod for something a settings hook already does, such as blocking one command: the hook is simpler and asks for less trust."],
        fields: [],
        source: docs("plugins/mods/overview#compare-mods-settings-hooks-skills-and-mcp-servers"),
    },
    {
        title: "Which files does a mod need?",
        text: "Three: the manifest, a `hooks/hooks.json` that points at your code, and the hooks module itself.",
        body: [
            "Claude Code reads `hooks/hooks.json` whenever it loads a plugin. A `modules` key in that file is what makes the plugin a mod: an array with one path, relative to `hooks.json`, to your code. The same file can still hold ordinary settings hooks under `hooks`.",
            "The hooks module is an ES module with an extension such as `.js`, `.mjs`, `.ts` or `.tsx`. Claude Code loads TypeScript directly, so there is no Node.js install, bundler or build step. The module must export a function named `register`.",
            "Keep imports static and local: `import` declarations at the top of the file, from files inside the plugin by relative path. The only bare import allowed is `claude-code`, for types and a few helpers. A dynamic `import()` fails validation, and `require` is not an ES module import.",
        ],
        example: {
            file: "mods/deploy-guard/hooks/hooks.json",
            lang: "json",
            code: `{
    "description": "The deploy-guard hooks module",
    "modules": ["./register.ts"]
}`,
            note: "The path starts from the `hooks/` folder, where `hooks.json` lives, not from the plugin root.",
        },
        pitfalls: [
            "Writing `./hooks/register.ts`: the path is relative to `hooks.json`, so it points nowhere.",
            "Listing several modules: a mod has one entry module, which imports any other files it needs.",
        ],
        fields: [],
        source: docs("plugins/mods/reference#files"),
    },
    {
        title: "What goes in a mod's manifest?",
        text: "The same `plugin.json` as any plugin: mods add no manifest fields of their own.",
        body: [
            "`name` is required and kebab-case. It identifies the mod, and Claude Code shows it in front of the text the mod's commands and log lines print. Names that pass as Anthropic's own, such as one starting with `claude-` or the exact name `claude-mods`, fail validation. `displayName` is only the label shown in the interface.",
            "`description` and `author` tell people what they are about to trust. A mod can read files, run processes and approve tool calls as the user, so say plainly in the description which events it intercepts and why.",
            "Set `version` and bump it on every release. Claude Code caches an installed plugin by version, so a fix you publish under the same version never reaches people who already installed the mod.",
        ],
        example: {
            file: "mods/deploy-guard/.claude-plugin/plugin.json",
            lang: "json",
            code: `{
    "name": "deploy-guard",
    "displayName": "Deploy Guard",
    "version": "0.1.0",
    "description": "Holds sf project deploy start against production orgs until you approve it, and adds a /deploys command",
    "author": {
        "name": "Acme Salesforce Team",
        "email": "salesforce-team@example.com"
    }
}`,
        },
        pitfalls: ["Shipping a fix without a new `version`: installed users keep running the old cached code."],
        fields: ["name", "displayName", "version", "description", "author", "authorEmail"],
        source: docs("plugins/mods/create#write-a-mod-yourself"),
    },
    {
        title: "How does the register function work?",
        text: "Claude Code calls `register` once when the mod loads and passes it `on`, the function that attaches each hook to an event.",
        body: [
            "Each call to `on` takes the event name, an optional matcher that filters the event, and the hook. Every hook receives the same three arguments: `$`, the mods API with every method a hook can call; `e`, the event as frozen plain data; and `next`, which passes the event on to the other mods and finally to Claude Code's own behavior.",
            "Variables declared at the top of the module are shared by all its hooks, which is how one hook can count what another one shows. They start over each time the module reloads, so keep anything that must survive a reload in `$.state` or `$.store`.",
            "Claude Code reads your code statically before it runs it. Write each event name as a string literal, write each API call in full, as in `$.ui.log(...)`, and never assign `$` or one of its namespaces to a variable. Code that breaks these rules fails validation.",
        ],
        example: {
            file: "mods/deploy-guard/hooks/register.ts",
            lang: "text",
            code: `let checked = 0

export function register(on) {
    on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
        checked += 1
        return next(e)
    })
}`,
            note: "Returning `next(e)` lets every Bash call continue exactly as it would without the mod.",
        },
        pitfalls: [
            "Writing `const ui = $.ui`: validation fails because `$.ui` is used as a value.",
            "Passing the event name in a variable or a loop: every name given to `on` must be a string literal.",
        ],
        fields: [],
        source: docs("plugins/mods/reference#the-hook-function"),
    },
    {
        title: "How do you observe, rewrite or answer an event?",
        text: "What your hook does with `next` decides everything: call it to let the event through, call it with a copy to change it, or skip it to answer yourself.",
        body: [
            "To observe, do your work and `return next(e)`. To act after the fact, `await next(e)` first, look at the result, and return it unchanged.",
            "To rewrite, pass a modified copy, as in `next({ ...e, text: e.text.trim() })` on `prompt.submit`. The event is deeply frozen and assigning to a field throws; the hooks after yours and Claude Code only ever see the copy you passed.",
            "To answer, return a result without calling `next`. On `tool.call` that can be `{ deny: reason }`: the tool never runs, and Claude reads your reason as the tool's result, so phrase it as an instruction it can follow. While it decides, a hook can hold the call and ask the user with `$.ui.ask`.",
        ],
        example: {
            file: "mods/deploy-guard/hooks/register.ts",
            lang: "text",
            code: guard,
            note: "`$.ui.ask` rejects when nobody can answer, as in a `claude -p` run, so the safe default refuses the deploy.",
        },
        pitfalls: [
            "Writing `e.command = ...`: the event is frozen, so the assignment throws.",
            "A vague deny reason: Claude reads it as the tool result, so tell it what to do instead.",
        ],
        fields: [],
        source: docs("plugins/mods/events#how-a-hook-handles-an-event"),
    },
    {
        title: "How do you narrow which events a hook sees?",
        text: "Pass a matcher as the second argument to `on`, and the hook runs only when every field in it matches the event.",
        body: [
            "A matcher is an object compared field by field with the event. A field can be one value, such as `{ tool: 'Bash' }`, an array of allowed values, such as `{ tool: ['Edit', 'Write'] }`, or a regular expression, such as `{ tool: /^mcp__salesforce__/ }`.",
            "Matchers keep a hook cheap and its intent obvious. In the guard, the matcher limits the hook to Bash, so `e.command` is always a shell command, and the regular expressions in the body only decide whether that command is a production deploy.",
            "Register each event once per matcher. Two `session.start` hooks without a matcher stop the module from loading, so put all your startup work in one hook. Event names can be wildcards too: `'classic.*'` matches every settings hook event.",
        ],
        example: {
            file: "mods/deploy-guard/hooks/register.ts",
            lang: "text",
            code: `on('tool.call', { tool: 'Bash' }, guard)
on('tool.call', { tool: ['Edit', 'Write'] }, track)
on('tool.call', { tool: /^mcp__salesforce__/ }, track)`,
            note: "`guard` and `track` are functions declared at the top level of the same file; a Read call matches none of these lines.",
        },
        pitfalls: ["Registering `session.start` twice without a matcher: the module fails to load."],
        fields: [],
        source: docs("plugins/mods/events#filter-which-events-a-hook-handles"),
    },
    {
        title: "How do you add a command?",
        text: "Register the command in a `session.start` hook, then answer it in a `command.run` hook filtered to its name.",
        body: [
            "A command a mod adds runs your function directly, with no Claude turn. Register it in `session.start`, which Claude Code waits for before the first prompt, so the command exists from the start. Then handle `command.run` with a matcher on the command's name.",
            "Return `{ text }` to print a line in the transcript, which Claude also reads, or `{}` to print nothing. The command has no behavior besides yours, so the hook never calls `next`. Add `immediate: true` to the registration if the command should run even while Claude is working.",
            "Pick a name no built-in command uses. `$.command.register` throws for a taken name, and a hook that throws is skipped, so the rest of that `session.start` hook does not run either. Register commands last in the hook, or wrap the call in `try`.",
        ],
        example: {
            file: "mods/deploy-guard/hooks/register.ts",
            lang: "text",
            code: whole,
            note: "The finished module: `/deploys` reads the same `held` counter the guard updates.",
        },
        pitfalls: ["Choosing a name a built-in command already uses: registration throws and the rest of the hook is skipped."],
        fields: [],
        source: docs("plugins/mods/api#add-a-command"),
    },
    {
        title: "What happens when a hook fails?",
        text: "A failing hook never breaks the session: Claude Code skips it, which for a guard means the held call goes ahead unless you add a `.catch`.",
        body: [
            "When a hook throws, times out or returns a result of the wrong shape before calling `next`, Claude Code skips it and the next handler runs in its place. If it fails after `next` resolved, that result stands. Either way one line names the mod, the event and the reason.",
            "A hook gets 10 seconds of its own execution time per event. Time spent inside `next` or inside a mods API call such as `$.ui.ask` does not count, but awaiting a promise of your own does. A guard that times out is skipped, so the command it was holding runs.",
            "To make a guard fail closed, attach `.catch` to the registration `on` returns. The handler checks `next.called`: if the guard had already called `next`, return `next(e)` to keep that result; otherwise return a deny. The handler itself has one second.",
        ],
        example: {
            file: "mods/deploy-guard/hooks/register.ts",
            lang: "text",
            code: `on('tool.call', { tool: 'Bash' }, guard).catch(async ($, e, next) => {
    if (next.called) return next(e)
    return { deny: 'The deploy guard failed, so this command was not run: ' + next.error.kind }
})`,
            note: "`next.error.kind` is `throw` or `timeout` when the guard itself failed.",
        },
        pitfalls: ["Doing slow work in promises of your own inside a guard: it counts against the 10 second limit, and a timeout lets the call through."],
        fields: [],
        source: docs("plugins/mods/events#handle-a-hook-that-fails"),
    },
    {
        title: "How do you try, test and debug it?",
        text: "Validate to see what Claude Code reads from your code, load it with `--plugin-dir` to hot-reload on save, and write tests for the rules you rely on.",
        body: [
            "Run `claude plugin validate` on the mod folder first. Besides the manifest, it reads the module the way Claude Code will and prints a `hooks:` line with every event and its matcher, and a `calls:` line with every mods API method. An event missing from that line will never be called, usually because of a typo.",
            "Load the mod with `claude --plugin-dir`. Claude Code watches that folder and reloads the module when you save, with a transcript line that lists its hooks; a save that breaks the module keeps the previous version running. In an interactive session it also writes type declarations into `.claude-plugin/types/` for your editor.",
            "For repeatable checks, write files ending in `.test.ts` that import from `claude-code/testing`, and run `claude plugin test`: it fires events through your hooks with no session, sign-in or network. When a mod does nothing, start Claude Code with `--debug-file` and search the log for the mod's name.",
        ],
        example: {
            file: "shell",
            lang: "bash",
            code: `claude plugin validate ./mods/deploy-guard
claude --plugin-dir ./mods/deploy-guard
claude plugin test ./mods/deploy-guard
claude --debug-file ./deploy-guard.log --plugin-dir ./mods/deploy-guard`,
            note: "For the guard, the `hooks:` line should list `session.start`, `tool.call{tool=Bash}` and `command.run{command=deploys}`.",
        },
        pitfalls: [
            "Editing an installed copy: it is cached by version, so develop against the folder with `--plugin-dir`.",
            "Running an older Claude Code: mods need v2.1.287 or later in the terminal.",
        ],
        fields: [],
        source: docs("plugins/mods/create#check-what-claude-code-reads-from-your-mod"),
    },
];
