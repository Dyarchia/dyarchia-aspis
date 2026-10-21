import type { Step } from "../kind.ts";

export const steps: readonly Step[] = [
    {
        title: "What is a command?",
        text: "A command is a single markdown file whose name becomes something you type as `/name`, sending its prompt to Claude.",
        body: [
            "Command files are the older format of skills. Claude Code merged the two: `.claude/commands/apex-test.md` and `.claude/skills/apex-test/SKILL.md` both create `/apex-test` and work the same way, and existing command files keep working.",
            "Claude Code reads personal commands from `~/.claude/commands/`, project commands from `.claude/commands/` in the repository, and plugin commands from the plugin's `commands/` folder. The file takes the same frontmatter as a skill except `name` and `paths`, followed by the prompt itself.",
            "Pick a command for a short prompt you trigger by hand and want to keep as one file. Move to a skill when it needs supporting files, a name that differs from the file, or loading tied to certain paths. Use CLAUDE.md for facts Claude should always know, and a subagent when the work should run in its own context.",
        ],
        example: {
            file: "commands/apex-test.md",
            lang: "markdown",
            code: `---
description: Writes or extends the Apex test class for one class.
---

Write or extend the test class for the Apex class $ARGUMENTS, with bulk and negative cases.`,
            note: "Saved as apex-test.md, this is /apex-test; whatever follows the command fills $ARGUMENTS.",
        },
        pitfalls: [
            "For new work the docs recommend skills, which do everything a command does and can also carry supporting files.",
            "A command, like a skill, is an instruction Claude follows, not an enforced rule; use a hook for anything that must hold every time.",
        ],
        fields: [],
        source: "https://code.claude.com/docs/en/skills#choose-where-skills-load",
    },
    {
        title: "How does the file name become the command?",
        text: "The file name without `.md` is the command, and subfolders add a prefix separated by a colon.",
        body: [
            "`commands/apex-test.md` becomes `/apex-test`. A file in a subfolder takes the folder path with each slash turned into a colon, so `commands/sf/apex-test.md` becomes `/sf:apex-test`. That is a handy way to group related commands without long names.",
            "A command file has no `name` field: to rename the command, rename the file. Use lowercase letters, digits and hyphens. Claude Code refuses names with characters such as `<`, `>`, zero-width spaces or doubled spaces, and a refused file does not load.",
            "Inside a plugin, the plugin name comes first: `commands/apex-test.md` in `my-plugin` is `/my-plugin:apex-test`. When a skill and a command file share a name, the skill is the one that runs.",
        ],
        example: {
            file: "commands/sf/apex-test.md",
            lang: "markdown",
            code: `---
description: Writes or extends the Apex test class for one class.
---

Write or extend the test class for the Apex class $ARGUMENTS.`,
            note: "Because it sits in the sf subfolder, you run this one as /sf:apex-test.",
        },
        pitfalls: [
            "Do not name a command file or subfolder `anthropic-skills`; Claude Code reserves that name and skips it.",
            "A command named like a built-in command or bundled skill replaces it under that name, which is easy to do by accident.",
        ],
        fields: [],
        source: "https://code.claude.com/docs/en/skills#how-a-skill-gets-its-command-name",
    },
    {
        title: "What does the / menu show?",
        text: "The description and the argument hint are what people see when they type `/` and scroll to your command.",
        body: [
            "The description says in one line what the command does. It is also how Claude decides when the command is relevant, so lead with the main use case. Leave it empty and Claude Code falls back to the first non-empty line of the prompt.",
            "The argument hint appears during autocomplete to show what should follow the command, such as `<ApexClassName>` or `[class] [coverage]`. It costs nothing and saves people from opening the file to remember the arguments.",
        ],
        example: {
            file: "commands/apex-test.md",
            lang: "markdown",
            code: `---
description: Writes or extends the Apex test class for one class, with bulk, negative and permission cases.
argument-hint: "<ApexClassName>"
---`,
            note: "The hint is quoted so the YAML stays a plain string.",
        },
        pitfalls: [
            "A description that only repeats the file name tells neither people nor Claude when to use it.",
            "Description and When to use together are cut at 1,536 characters in the listing, so put the key use case first.",
        ],
        fields: ["description", "argument-hint"],
        source: "https://code.claude.com/docs/en/skills#frontmatter-reference",
    },
    {
        title: "How do you write the prompt?",
        text: "Everything after the frontmatter is the prompt Claude receives when the command runs.",
        body: [
            "Write it as you would type it to Claude yourself, only once and carefully: the goal, the steps, and what a good result looks like. State what to do rather than explaining at length why: once the command runs, every line of it stays in context.",
            "That text stays in the conversation for the following turns, and Claude does not re-read the file. Phrase anything that should hold for the whole task as a standing instruction, for example \"run the tests after every change\" rather than \"run the tests\".",
            "The frontmatter is only read when the opening `---` is the very first line. If it is not, Claude Code treats the whole file, markers included, as the prompt.",
        ],
        example: {
            file: "commands/apex-test.md",
            lang: "markdown",
            code: `---
description: Writes or extends the Apex test class for one class, with bulk, negative and permission cases.
argument-hint: "<ApexClassName>"
---

Write or extend the test class for the Apex class $ARGUMENTS.

1. Read the class and list every public method.
2. Cover each method with a positive case, a negative case and a bulk case of 200 records.
3. Use System.runAs for code that depends on the running user's permissions.
4. Assert on results with System.assertEquals; never write a test without assertions.

Reply with the test class and the coverage you expect it to reach.`,
            note: "Steps and the expected output are explicit, so the prompt works the same no matter who runs it.",
        },
        pitfalls: [
            "A blank line or comment before the opening `---` turns the frontmatter into prompt text.",
            "A prompt that leans on files or context only you have in mind will produce different results for each teammate.",
        ],
        fields: ["body"],
        source: "https://code.claude.com/docs/en/skills#skill-content-lifecycle",
    },
    {
        title: "How does it fill in your input and live data?",
        text: "Placeholders take what you typed after the command, and `` !`command` `` lines take live output, all before Claude reads the prompt.",
        body: [
            "`$ARGUMENTS` is everything typed after the command. `$0`, `$1` and so on pick single arguments by position, counting from zero, and quotes keep several words together. Declare names under Arguments and you can write `$target` instead of `$0`. If no placeholder takes the input, Claude Code appends it as `ARGUMENTS: <what you typed>`.",
            "A line with `` !`command` `` runs that command first and puts its output in place of the line, so the prompt arrives with real data. The `!` must start the line or follow a space. Shell chooses bash, the default, or powershell to run it.",
            "These commands never ask for permission. Outside auto mode, one your permissions do not already allow aborts the whole run, as does a command that fails. Pre-approve it in Allowed tools, covered two screens on.",
        ],
        example: {
            file: "commands/apex-test.md",
            lang: "markdown",
            code: `---
description: Writes or extends the Apex test class for one class, with bulk, negative and permission cases.
argument-hint: "<ApexClassName>"
arguments: [target]
allowed-tools: Bash(git ls-files *)
---

## Existing test classes

!\`git ls-files "*Test.cls"\`

Write or extend the test class for $target. Reuse the test data factories you find among the files above.`,
            note: "Typing /apex-test AccountService fills $target, and the list of test classes is already in the prompt when Claude reads it.",
        },
        pitfalls: [
            "Positions start at zero, so the first argument is `$0`, not `$1`.",
            "`shell: bash` fails on Windows without Git Bash; set `shell: powershell` there.",
            "A check script that exits 1 when it finds problems aborts the command; append `|| true` to it under bash.",
        ],
        fields: ["arguments", "shell"],
        source: "https://code.claude.com/docs/en/skills#available-string-substitutions",
    },
    {
        title: "Should Claude ever run it on its own?",
        text: "Command files accept the same invocation control as skills, so decide whether Claude may start it or only you can.",
        body: [
            "A command file works the same way as a skill of the same name, and that includes Claude being able to start it when a request matches its description. When to use adds trigger phrases to that description, and the two together share the 1,536 character cap.",
            "Turn on Only when typed (`disable-model-invocation: true`) for anything with side effects or timing you want to control, such as a deploy or a data load. Claude then cannot start it on its own and its description leaves Claude's context, but `/name` still runs it.",
            "Typing `/name` only runs the command at the start of your message. Written later in a sentence, it just gives Claude permission to run it while answering.",
        ],
        example: {
            file: "commands/deploy-uat.md",
            lang: "markdown",
            code: `---
description: Validates and deploys the current branch to the UAT org.
argument-hint: "<test-level>"
disable-model-invocation: true
---

Deploy the current branch to the UAT org with test level $ARGUMENTS and report the result.`,
            note: "A deploy should happen only when you ask for it, so this command is typed-only.",
        },
        pitfalls: [
            "Leaving a deploy or data-changing command open to Claude means it may decide the work looks ready and start it.",
            "Trigger phrases in When to use do nothing for a typed-only command, because Claude never sees its description.",
        ],
        fields: ["disable-model-invocation", "when_to_use"],
        source: "https://code.claude.com/docs/en/skills#control-who-invokes-a-skill",
    },
    {
        title: "Which tools may it use without asking?",
        text: "Allowed tools pre-approves what the command needs for one turn; Denied tools takes tools away while it runs.",
        body: [
            "List the tools the command relies on, such as `Read`, `Grep` or a Bash pattern like `Bash(sf apex run test *)`, as a space or comma separated string or a YAML list. Claude can use them without prompting during the turn that runs the command, and the grant clears when you send your next message.",
            "Allowed tools grants, it does not restrict: every other tool stays available under your normal permission settings. To keep a command away from certain tools, list them under Denied tools; that restriction also lasts until your next message.",
        ],
        example: {
            file: "commands/apex-test.md",
            lang: "markdown",
            code: `---
description: Writes or extends the Apex test class for one class, with bulk, negative and permission cases.
argument-hint: "<ApexClassName>"
arguments: [target]
allowed-tools: Read Grep Bash(git ls-files *) Bash(sf apex run test *)
disallowed-tools: WebFetch WebSearch
---`,
            note: "The command may run Apex tests without prompting, and works from the repository alone because web tools are removed while it is active.",
        },
        pitfalls: [
            "Read the allowed tools of commands checked into a repository before running Claude Code there; workspace trust does not gate them.",
            "To approve a tool for the whole session, add an allow rule to your permission settings instead.",
        ],
        fields: ["allowed-tools", "disallowed-tools"],
        source: "https://code.claude.com/docs/en/skills#pre-approve-tools-for-a-skill",
    },
    {
        title: "Which model runs it, and where?",
        text: "A command runs in your conversation on the session model unless you switch the model, the effort, or hand it to a subagent.",
        body: [
            "Model overrides the session model for the rest of the turn that runs the command, then the session model returns with your next prompt. It accepts anything `/model` does, such as `sonnet` or `opus`, or `inherit`. Effort overrides the session effort level while the command is active; available levels depend on the model.",
            "Set Context to `fork` and Claude Code starts a subagent with the prompt as its task. Agent picks its type: `Explore`, `Plan`, `general-purpose` (the default) or one of your own agents. The subagent does not see your conversation, so the prompt must carry everything it needs, and only its result comes back.",
        ],
        example: {
            file: "commands/apex-test.md",
            lang: "markdown",
            code: `---
description: Writes or extends the Apex test class for one class, with bulk, negative and permission cases.
argument-hint: "<ApexClassName>"
arguments: [target]
context: fork
agent: general-purpose
model: sonnet
effort: medium
---

Write or extend the test class for $target and return the file you wrote with the coverage you expect.`,
            note: "general-purpose can edit files, which a test writer needs; Explore is read-only.",
        },
        pitfalls: [
            "A forked command runs in the background by default, and its file edits fall outside your checkpoints, so `/rewind` will not undo them.",
            "`Explore` and `Plan` start without your CLAUDE.md, so conventions the command relies on must be in the prompt.",
        ],
        fields: ["model", "effort", "context", "agent"],
        source: "https://code.claude.com/docs/en/skills#run-skills-in-a-subagent",
    },
    {
        title: "How do you try it and fix it?",
        text: "Type `/` and look for it in the menu, then run it with a real argument and read what Claude received.",
        body: [
            "If a new or edited command does not show up, run `/reload-skills`, which re-scans the skill and command directories without a restart. Commands in a folder added with `--add-dir` are not reloaded live, so restart the session after changing those.",
            "If `/name` reports Unknown command, check the file name for refused characters or a reserved name. If it runs something else, a skill with the same name is taking precedence. If the frontmatter seems ignored, make sure the opening `---` is the first line and the YAML parses; `claude --debug` shows the parse error.",
            "When the prompt runs but the result is off, look at what was substituted: a `$1` that should have been `$0`, an empty named argument, or a `` !`command` `` that aborted. If the command has grown supporting notes or needs to load on its own for certain files, move it to a skill.",
        ],
        example: {
            file: "Claude Code prompt",
            lang: "text",
            code: `> /reload-skills
> /apex-test AccountService
> /sf:apex-test AccountService`,
            note: "Reload first, then run the command by its plain name and, for a file in a subfolder, by its prefixed name.",
        },
        pitfalls: [
            "A misspelled field such as `allowed_tools` is ignored without any error.",
            "Testing only in the session where you wrote the command hides gaps; try it in a fresh session too.",
        ],
        fields: [],
        source: "https://code.claude.com/docs/en/skills#troubleshooting",
    },
];
