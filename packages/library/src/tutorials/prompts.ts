import type { Step } from "../kind.ts";

export const steps: readonly Step[] = [
    {
        title: "What is a prompt?",
        text: "A prompt is a request you send Claude often enough to keep it as a template, with {{name}} marking what changes each time.",
        body: [
            "Claude Code has no file format for prompts and never loads them on its own. This library keeps each one as `prompts/<name>.md`, the smallest format that fits: a short frontmatter with a description and the list of variables, then the template itself as the body.",
            "To use one, replace every {{name}} with this task's value and send the result to Claude Code, typed into a session or passed to `claude -p`. Claude reads it exactly like a message you wrote by hand, so everything that makes a good message makes a good template.",
            "Choose a prompt for work you start by hand and are still shaping. Once it stops changing and you run it every week, turn it into a skill so it becomes a `/command`. Rules Claude must always follow belong in CLAUDE.md, and a job that should run in its own context is an agent.",
        ],
        example: {
            file: "prompts/fix-apex-test.md",
            lang: "markdown",
            code: [
                "---",
                "description: Fix a failing Apex test class at its root cause and prove it passes in the target org.",
                "variables: [test_class, org_alias]",
                "---",
                "",
                "The Apex test class {{test_class}} fails in the org {{org_alias}}. Find the root cause and fix the code under test so every test method passes.",
            ].join("\n"),
            note: "A working template already; the next screens make it a good one.",
        },
        pitfalls: [
            "Pasting the template with a {{name}} still in it: Claude Code does not fill it in, Claude just sees the braces.",
        ],
        fields: [],
        source: "https://code.claude.com/docs/en/prompt-library#related-resources",
    },
    {
        title: "How will you find it again?",
        text: "The description is how you pick this template out of the library months from now.",
        body: [
            "Unlike a skill or an agent, nothing reads a prompt's description to decide when to use it. You do. Write it for yourself on a busy day: what the prompt gets done and in which situation, in one sentence.",
            "Lead with the outcome and the domain, such as \"Fix a failing Apex test class\" rather than \"Testing helper\". If two templates could match the same search, the descriptions should make the difference obvious.",
        ],
        example: {
            file: "prompts/fix-apex-test.md",
            lang: "markdown",
            code: [
                "---",
                "description: Fix a failing Apex test class at its root cause and prove it passes in the target org.",
                "---",
            ].join("\n"),
            note: "Outcome, subject and finish line in one sentence.",
        },
        pitfalls: [
            "Describing the wording of the prompt instead of what it achieves.",
        ],
        fields: ["description"],
        source: "https://code.claude.com/docs/en/prompt-library#what-makes-these-prompts-work",
    },
    {
        title: "How do you say what you want?",
        text: "Describe the outcome, not the steps, and give a target that makes \"done\" unambiguous.",
        body: [
            "Claude can find files and work out a plan, so the template should spend its words on the result you want. \"Fix the code under test so every test method passes\" lets Claude choose how; a list of edits to make would lock in your guess about the cause.",
            "Be explicit about scope and limits. If you want the cause fixed rather than the test bent to pass, say so, and say why: Claude follows an instruction better when it knows the reason behind it.",
            "When the goal is measurable, such as coverage, a limit or a duration, write the number. A target with a threshold leaves no doubt about when to stop.",
        ],
        example: {
            file: "prompts/fix-apex-test.md",
            lang: "markdown",
            code: [
                "The Apex test class {{test_class}} fails in the org {{org_alias}}. Find the root cause and fix the code under test so every test method passes.",
                "",
                "Keep the assertions as they are: they describe the behaviour the business signed off. If you believe one of them is wrong, stop and tell me why instead of changing it.",
            ].join("\n"),
            note: "The second paragraph sets a limit and explains it, so Claude can apply it to cases you did not foresee.",
        },
        pitfalls: [
            "Scripting every step, which turns Claude into a typist and hides the better fix it would have found.",
            "Leaving the finish line implicit, so Claude stops when the work merely looks done.",
        ],
        fields: ["body"],
        source: "https://code.claude.com/docs/en/prompt-library#what-makes-these-prompts-work",
    },
    {
        title: "How will Claude check its own work?",
        text: "Put a check Claude can run inside the prompt, so it iterates until the check passes instead of stopping at a first attempt.",
        body: [
            "Without a check, Claude stops when the work looks finished and you become the one who finds every mistake. With a command that returns pass or fail, it can run it, read the result and keep going until it passes.",
            "In Salesforce work the check is usually a test run against the org, a deploy that must succeed, or a query whose result you can predict. Name the exact command in the template so nobody has to remember it.",
            "Ask for evidence, not a verdict: the command it ran and what came back. Reading real output is faster than running the check again yourself.",
        ],
        example: {
            file: "prompts/fix-apex-test.md",
            lang: "markdown",
            code: [
                "When the fix is in, deploy it with `sf project deploy start --target-org {{org_alias}}` and run `sf apex run test --class-names {{test_class}} --target-org {{org_alias}} --synchronous`.",
                "",
                "Keep iterating until every method passes, then show me the final test output instead of telling me it passed.",
            ].join("\n"),
            note: "The check uses the same variables as the request, so it always targets the right class and org.",
        },
        pitfalls: [
            "Saying \"make sure it works\" without naming how, which gives Claude nothing to run.",
        ],
        fields: ["body"],
        source: "https://code.claude.com/docs/en/best-practices#give-claude-a-way-to-verify-its-work",
    },
    {
        title: "What should the prompt point Claude at?",
        text: "Give Claude the real artifact and a pattern to follow, rather than your description of them.",
        body: [
            "Claude reads the source better than your summary of it. Paste the error, the debug log or the failing test output straight into the prompt, or reference a file with `@` so Claude opens it before answering.",
            "Point at an existing example to match. Naming the class that already follows your trigger handler pattern keeps the fix consistent with the rest of the org, without writing the convention out again.",
            "Scope the search. If you know where the problem probably lives, say so; an unscoped \"investigate\" can send Claude through hundreds of files.",
        ],
        example: {
            file: "prompts/fix-apex-test.md",
            lang: "markdown",
            code: [
                "Here is the failure output:",
                "",
                "{{failure}}",
                "",
                "Trigger logic in this org follows the handler pattern in force-app/main/default/classes/AccountTriggerHandler.cls. Match it in anything you touch.",
            ].join("\n"),
            note: "The pasted failure becomes a variable; the pattern to follow is fixed, so it stays in the template.",
        },
        pitfalls: [
            "Retyping an error from memory instead of pasting it, which loses the line numbers Claude needs.",
        ],
        fields: ["body"],
        source: "https://code.claude.com/docs/en/best-practices#provide-specific-context-in-your-prompts",
    },
    {
        title: "How should the answer come back?",
        text: "Name the shape, length and audience of the answer so it fits how you will use it.",
        body: [
            "If you will paste the result into a pull request, a ticket or a message to a client, say so and describe the parts you need. Claude cannot guess that the answer is for a reviewer rather than for you.",
            "Say what to do rather than what to avoid: \"answer in three short parts\" works better than \"don't be verbose\". The style of the prompt itself leaks into the answer too, so a prompt full of headings tends to get headings back.",
        ],
        example: {
            file: "prompts/fix-apex-test.md",
            lang: "markdown",
            code: [
                "Answer in three parts: the root cause in two sentences, the files you changed, and the final test output.",
            ].join("\n"),
            note: "Short, positive and countable: easy for Claude to follow and for you to check.",
        },
        pitfalls: [
            "Asking for a format in one template and the opposite in your CLAUDE.md, which leaves Claude choosing between them.",
        ],
        fields: ["body"],
        source: "https://code.claude.com/docs/en/prompt-library#what-makes-these-prompts-work",
    },
    {
        title: "How do you mark what changes each time?",
        text: "Write {{name}} wherever a value changes between uses, and list every name in Variables.",
        body: [
            "A variable is anything you would otherwise edit by hand before sending: a class name, an org alias, a pasted log. Use short lowercase names with underscores, and reuse the same name everywhere the value appears, so one fill updates them all.",
            "List each name in Variables. It tells whoever uses the template what to bring before starting, and this library warns when the body uses a name you did not declare, or declares one the body never uses.",
            "The {{name}} syntax is this library's own. Claude Code does not replace it. When the template becomes a skill, the same idea is written `$name` with an `arguments` list, and Claude Code fills it from what you type after the command.",
        ],
        example: {
            file: "prompts/fix-apex-test.md",
            lang: "markdown",
            code: [
                "---",
                "description: Fix a failing Apex test class at its root cause and prove it passes in the target org.",
                "variables: [test_class, org_alias, failure]",
                "---",
                "",
                "The Apex test class {{test_class}} fails in the org {{org_alias}}. Find the root cause and fix the code under test so every test method passes.",
                "",
                "Here is the failure output:",
                "",
                "{{failure}}",
            ].join("\n"),
            note: "Three declared names, each used in the body, so the library has nothing to warn about.",
        },
        pitfalls: [
            "Turning fixed instructions into variables: if a value is the same every time, write it into the template.",
            "Spelling a name two ways, like {{org}} and {{org_alias}}, which leaves one of them unfilled.",
        ],
        fields: ["variables", "body"],
        source: "https://code.claude.com/docs/en/skills#available-string-substitutions",
    },
    {
        title: "When should a prompt become something else?",
        text: "A prompt you keep typing wants to be a skill, and a correction you keep repeating wants to be a rule.",
        body: [
            "When you start the same task with the same prompt again and again, save it as a skill. It then runs as a `/command` for anyone on your team, and Claude Code fills its arguments for you, so nobody copies and edits text by hand.",
            "When Claude gets the same convention wrong twice, the fix is not a longer template: record it in CLAUDE.md, so every session starts knowing it. For larger or riskier changes, start in plan mode so you see the files involved before any edit happens.",
        ],
        example: {
            file: ".claude/skills/fix-apex-test/SKILL.md",
            lang: "markdown",
            code: [
                "---",
                "name: fix-apex-test",
                "description: Fix a failing Apex test class at its root cause and prove it passes in the target org.",
                "arguments: [test_class, org_alias]",
                "disable-model-invocation: true",
                "---",
                "",
                "The Apex test class $test_class fails in the org $org_alias. Find the root cause and fix the code under test so every test method passes.",
            ].join("\n"),
            note: "The same template as a skill: typing /fix-apex-test AccountTriggerTest dev-sandbox fills both arguments.",
        },
        fields: [],
        source: "https://code.claude.com/docs/en/features-overview#build-your-setup-over-time",
    },
    {
        title: "How do you try it and improve it?",
        text: "Fill it in for a real task, watch the first run closely, and fold every lesson back into the template.",
        body: [
            "Run it on two or three real cases before you trust it. Fill every variable, send it, and follow along. Press `Esc` as soon as Claude heads the wrong way and correct it; early corrections cost less than late ones.",
            "If you correct the same thing more than twice, stop. The session is now full of failed attempts. Run `/clear`, change the template so the next run starts with what you just learned, and try again with a clean context.",
            "Watch what worked as much as what failed. When a run goes well, notice which part of the template carried it, and keep that part as you edit the rest.",
        ],
        example: {
            file: "prompts/fix-apex-test.md",
            lang: "markdown",
            code: [
                "Only change classes under force-app/main/default/classes. Do not modify managed package code or metadata outside that folder.",
            ].join("\n"),
            note: "A line added after a first run wandered into the wrong folder: the lesson lives in the template now, not in one chat.",
        },
        pitfalls: [
            "Fixing a bad run with follow-up messages and never updating the template, so the next run fails the same way.",
            "Testing on one easy case only, then finding the template breaks on the first unusual one.",
        ],
        fields: [],
        source: "https://code.claude.com/docs/en/best-practices#course-correct-early-and-often",
    },
];
