import type { Step } from "../kind.ts";

export const steps: readonly Step[] = [
    {
        title: "What is a skill?",
        text: "A skill is a folder with a SKILL.md file that teaches Claude a procedure or a body of knowledge it pulls in only when it is needed.",
        body: [
            "SKILL.md has two parts: YAML frontmatter between `---` markers that says what the skill is for, and markdown instructions that Claude follows once the skill is in use. The folder can also hold reference files and scripts that the instructions point to.",
            "At the start of a session Claude only sees each skill's name and description. When your request matches a description, or when you type `/skill-name`, the full instructions load into the conversation. Until then a long skill costs almost nothing, which is the main difference from CLAUDE.md, whose content is loaded in every session.",
            "Claude Code reads personal skills from `~/.claude/skills/<name>/SKILL.md`, project skills from `.claude/skills/<name>/SKILL.md` in the repository, and plugin skills from the plugin's `skills/` folder. Personal skills follow you into every project; project skills reach everyone who clones the repo.",
            "Choose a skill when you keep pasting the same checklist or procedure into chat. Keep always-true facts in CLAUDE.md or a rule, use a subagent when the work should happen in its own context and only a summary should come back, and use a hook for anything that must happen every time without exception.",
        ],
        example: {
            file: "skills/apex-review/SKILL.md",
            lang: "markdown",
            code: `---
description: Reviews Apex classes and triggers for governor limit risks and missing bulkification. Use when the user asks to review or audit Apex code.
---

Review the Apex in scope and report findings grouped by severity, each with the file, the line and a concrete fix.`,
            note: "The smallest useful skill: one description that tells Claude when to load it, and instructions for what to do.",
        },
        pitfalls: [
            "A skill is guidance Claude applies with judgment, not a guarantee; a rule that must never be broken belongs in a hook.",
            "Every skill Claude can invoke adds its description to every request, so a pile of unused skills still costs context.",
        ],
        fields: [],
        source: "https://code.claude.com/docs/en/features-overview#compare-similar-features",
    },
    {
        title: "What will you type to run it?",
        text: "The folder name becomes the command, so `skills/apex-review/` is `/apex-review` unless the name field says otherwise.",
        body: [
            "In a personal or project skill, the frontmatter `name` sets the command shown in the `/` menu and the one you type. Leave it empty and the folder name is used. The folder name keeps invoking the skill either way, so the two are rarely worth making different.",
            "Use lowercase letters, digits and hyphens. Claude Code refuses names with characters such as `<`, `>`, zero-width spaces or doubled spaces, and a folder it refuses does not load at all.",
            "Inside a plugin the command is namespaced: `my-plugin/skills/apex-review/SKILL.md` becomes `/my-plugin:apex-review`. If a skill and a file in `.claude/commands/` share a name, the skill wins.",
        ],
        example: {
            file: "skills/apex-review/SKILL.md",
            lang: "markdown",
            code: `---
name: apex-review
description: Reviews Apex classes and triggers for governor limit risks and missing bulkification.
---`,
            note: "Here name only repeats the folder name, which keeps the menu label and the folder in step.",
        },
        pitfalls: [
            "Do not name a skill folder `synced` or `anthropic-skills`; Claude Code reserves both and skips the skill.",
            "A skill named like a built-in command or bundled skill replaces it under that name, so pick a name that does not shadow one you still use.",
        ],
        fields: ["name"],
        source: "https://code.claude.com/docs/en/skills#how-a-skill-gets-its-command-name",
    },
    {
        title: "When should Claude reach for it?",
        text: "Claude picks skills by reading their descriptions, so the description is the trigger and deserves the most care.",
        body: [
            "Write the description as what the skill does plus when to use it, in the words people actually type. Lead with the main use case: if Claude has to guess from a vague sentence, it may load the wrong skill or miss yours.",
            "Use When to use for extra trigger phrases and example requests. Claude Code appends it to the description in the skill listing, and the two together are cut at 1,536 characters, so anything past that point is never seen.",
            "Leave both empty and Claude falls back to the first non-empty line of the instructions, which is rarely a good trigger. With many skills installed, Claude Code may also drop the descriptions of the skills you use least to fit its listing budget.",
        ],
        example: {
            file: "skills/apex-review/SKILL.md",
            lang: "markdown",
            code: `---
name: apex-review
description: Reviews Apex classes and triggers for governor limit risks, SOQL or DML inside loops, hardcoded IDs and weak tests. Use when the user asks to review, audit or check Apex code before a deploy.
when_to_use: Requests like "review AccountService", "is this trigger bulkified", "check my Apex before I deploy to UAT".
---`,
            note: "The use case comes first and the phrases a Salesforce developer would really say come last.",
        },
        pitfalls: [
            "Two skills with overlapping descriptions compete, and Claude may pick the wrong one.",
            "A description that is too broad makes the skill fire on unrelated requests; narrow it before reaching for other fixes.",
        ],
        fields: ["description", "when_to_use"],
        source: "https://code.claude.com/docs/en/skills#frontmatter-reference",
    },
    {
        title: "What should the instructions say?",
        text: "The body is what Claude reads once the skill loads: either knowledge to apply or a task to carry out.",
        body: [
            "Reference skills hold conventions and domain knowledge Claude applies alongside your work, such as your Apex style guide. Task skills give step by step instructions for one action, such as a review or a deploy. Decide which one you are writing, because it shapes who should start it and whether it can run in a subagent.",
            "Keep it short and direct. Once loaded, the content stays in the conversation for the following turns, so every line is a recurring cost, and Claude does not re-read the file later. Write rules that should hold for the whole task as standing instructions, not one-off steps.",
            "Keep SKILL.md under about 500 lines and move detail into files beside it, linked from the body so Claude knows what each one holds and opens it only when needed. After a compaction only the start of a long skill may survive, so put what matters most at the top.",
        ],
        example: {
            file: "skills/apex-review/SKILL.md",
            lang: "markdown",
            code: `---
name: apex-review
description: Reviews Apex classes and triggers for governor limit risks and missing bulkification. Use when the user asks to review or audit Apex code.
---

Review the Apex in scope against this checklist and report findings grouped by severity.

1. SOQL queries or DML statements inside loops
2. Triggers that handle a single record instead of the whole Trigger.new list
3. Hardcoded record IDs or org-specific URLs
4. Test classes without assertions or without bulk test data

For each finding give the file, the line and a concrete fix. If nothing is wrong, say so in one line.

For the full team checklist, see [checklist.md](checklist.md).`,
            note: "The checklist that matters every time stays in SKILL.md; the long version lives in a supporting file.",
        },
        pitfalls: [
            "Narrating why each step exists makes the skill longer without making Claude follow it better.",
            "A supporting file that the body never mentions is one Claude has no reason to open.",
        ],
        fields: ["body"],
        source: "https://code.claude.com/docs/en/skills#types-of-skill-content",
    },
    {
        title: "Who gets to start it?",
        text: "By default both you and Claude can start a skill; two switches and a path filter narrow that down.",
        body: [
            "Turn on Only when typed (`disable-model-invocation: true`) for anything with side effects or timing you want to control, such as a deploy. Claude then never starts it on its own, its description leaves Claude's context, and it is not preloaded into subagents. You still run it with `/name`.",
            "Turn off In the / menu (`user-invocable: false`) for background knowledge that is not an action, such as notes on a legacy integration. Claude can still load it when relevant, but it disappears from the menu and typing its name does nothing.",
            "Paths limits automatic loading to work on matching files, using glob patterns like `force-app/**/*.cls`. A review skill that only makes sense for Apex then stays quiet while you edit Lightning components.",
        ],
        example: {
            file: "skills/apex-review/SKILL.md",
            lang: "markdown",
            code: `---
name: apex-review
description: Reviews Apex classes and triggers for governor limit risks and missing bulkification. Use when the user asks to review or audit Apex code.
paths:
  - "force-app/**/*.cls"
  - "force-app/**/*.trigger"
---`,
            note: "A read-only review is safe for Claude to start itself, so only the paths filter is set.",
        },
        pitfalls: [
            "Setting both Only when typed and hiding it from the menu leaves a skill nobody can start.",
            "Hiding a skill from the menu does not stop Claude from using it; only `disable-model-invocation` does.",
        ],
        fields: ["disable-model-invocation", "user-invocable", "paths"],
        source: "https://code.claude.com/docs/en/skills#control-who-invokes-a-skill",
    },
    {
        title: "How does it take input?",
        text: "Whatever you type after the command reaches the instructions through placeholders that Claude Code fills in before Claude reads them.",
        body: [
            "`$ARGUMENTS` expands to everything typed after the command. `$0`, `$1` and so on pick single arguments by position, starting at zero, and quoting keeps several words together. Declare names under Arguments and you can write `$target` instead of `$0`.",
            "If no placeholder in the body takes the input, Claude Code appends it at the end as `ARGUMENTS: <what you typed>`, so nothing is lost. A named argument nobody passed becomes an empty string, while a missing positional one such as `$2` stays in the text as written.",
            "The Argument hint appears in autocomplete as a reminder of what to type, for example a class name. To write a literal dollar amount like `$1.00` in prose, escape it as `\\$1.00`.",
        ],
        example: {
            file: "skills/apex-review/SKILL.md",
            lang: "markdown",
            code: `---
name: apex-review
description: Reviews Apex classes and triggers for governor limit risks and missing bulkification. Use when the user asks to review or audit Apex code.
argument-hint: "[class-or-trigger-name]"
arguments: [target]
---

Review $target against the checklist below. When no class or trigger is named, review the Apex files changed on this branch.`,
            note: "Typing /apex-review AccountService fills $target with AccountService; the hint is quoted so YAML keeps the brackets as text.",
        },
        pitfalls: [
            "Placeholders count from zero, so the first argument is `$0`, not `$1`.",
            "Arguments only arrive when the skill is invoked with them; reference knowledge that Claude loads on its own should not depend on them.",
        ],
        fields: ["arguments", "argument-hint"],
        source: "https://code.claude.com/docs/en/skills#pass-arguments-to-skills",
    },
    {
        title: "What can it run without asking?",
        text: "A skill can pull live output into its instructions and pre-approve the tools it needs, but only for the turn that invokes it.",
        body: [
            "A line with `` !`command` `` runs that command before Claude sees the skill and replaces it with the output, so the instructions arrive with real data such as the current diff. The `!` must start the line or follow a space. Use a fenced block opened with ```! for several commands. Shell picks bash, the default, or powershell to run them.",
            "These commands never prompt you. Outside auto mode, one that your permissions do not already allow aborts the whole invocation, and so does a command that fails. Allowed tools pre-approves what the skill needs, for example `Bash(git diff *)`, for that turn only; the grant clears with your next message.",
            "Allowed tools grants, it does not restrict: every other tool stays available under your normal permissions. To take tools away while the skill is active, list them under Denied tools.",
        ],
        example: {
            file: "skills/apex-review/SKILL.md",
            lang: "markdown",
            code: `---
name: apex-review
description: Reviews Apex classes and triggers for governor limit risks and missing bulkification. Use when the user asks to review or audit Apex code.
allowed-tools: Bash(git diff *) Read Grep
disallowed-tools: Edit Write
---

## Apex changed on this branch

!\`git diff --name-only HEAD -- force-app\`

Review the files listed above against the checklist below. Report findings only; do not change any file.`,
            note: "The injected git diff is pre-approved by the matching Bash rule, and denying Edit and Write keeps the review read-only.",
        },
        pitfalls: [
            "`shell: bash` fails on Windows without Git Bash; set `shell: powershell` there.",
            "A check script that exits 1 when it finds problems aborts the skill; append `|| true` to it under bash.",
            "Review the allowed tools of skills checked into a repository before you run Claude Code there, because workspace trust does not gate them.",
        ],
        fields: ["shell", "allowed-tools", "disallowed-tools"],
        source: "https://code.claude.com/docs/en/skills#inject-dynamic-context",
    },
    {
        title: "Where and on which model should it run?",
        text: "A skill runs in your conversation by default; it can switch model and effort, or hand the whole task to a subagent.",
        body: [
            "Model overrides the session model for the rest of the turn that invokes the skill, and the session model resumes with your next prompt. It accepts anything `/model` does, such as `sonnet` or `opus`, or `inherit`. Effort overrides the session effort level while the skill is active; which levels exist depends on the model.",
            "Set Context to `fork` and Claude Code starts a subagent with the skill's content as its prompt. Agent picks the subagent type: `Explore`, `Plan`, `general-purpose` (the default) or one of your own agents. With a fork, Model sets the subagent's model instead.",
            "The subagent does not see your conversation, so the instructions must stand on their own, and Explore and Plan start without your CLAUDE.md. A fork runs in the background and its result arrives when done; turn Background off to wait for it in the same turn.",
        ],
        example: {
            file: "skills/apex-review/SKILL.md",
            lang: "markdown",
            code: `---
name: apex-review
description: Reviews Apex classes and triggers for governor limit risks and missing bulkification. Use when the user asks to review or audit Apex code.
context: fork
agent: Explore
model: sonnet
effort: high
background: false
---

Review the Apex files under force-app against this checklist and return the findings grouped by severity.`,
            note: "Explore is read-only and the review needs no conversation history, so it can safely run apart and hand back only its findings.",
        },
        pitfalls: [
            "Forking a reference skill with no task gives the subagent nothing to do, and it returns without useful output.",
            "A background fork edits files outside your checkpoints, so `/rewind` cannot undo its changes; use git.",
        ],
        fields: ["model", "effort", "context", "agent", "background"],
        source: "https://code.claude.com/docs/en/skills#run-skills-in-a-subagent",
    },
    {
        title: "How do you try it and fix it?",
        text: "Test both doors in: ask for the task in plain words to see whether Claude picks the skill up, then type `/name` to run it directly.",
        body: [
            "Claude Code watches the skill folders, so edits to SKILL.md apply in the running session. If you created a skills folder that did not exist when the session started, run `/reload-skills` first. Ask `What skills are available?` to confirm Claude can see it.",
            "If it never triggers, sharpen the description with the words you actually used. If `/name` is not recognized either, the name may have been refused. If it triggers too often, make the description narrower or turn on Only when typed.",
            "Frontmatter only counts when the opening `---` is the first line of the file. Malformed YAML still loads the body with no fields, so `/name` works but automatic matching does not; `claude --debug` shows the parse error, and `claude plugin validate .claude/skills` finds broken frontmatter.",
            "Seeing it trigger is not proof it works. Try a few realistic prompts in a fresh session, then again with the skill turned off, and compare. If Claude stops following it after a compaction, invoke it again.",
        ],
        example: {
            file: "Claude Code prompt",
            lang: "text",
            code: `> What skills are available?
> Review AccountService before I deploy it
> /apex-review AccountService`,
            note: "The first prompt checks discovery, the second checks the description triggers it, the third runs it on demand.",
        },
        pitfalls: [
            "Testing in the same session where you wrote the skill hides gaps, because Claude still remembers what you meant.",
            "A misspelled field name such as `allowed_tools` is ignored without any error.",
        ],
        fields: [],
        source: "https://code.claude.com/docs/en/skills#troubleshooting",
    },
];
