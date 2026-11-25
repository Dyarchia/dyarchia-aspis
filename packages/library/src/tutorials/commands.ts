import type { Step } from "../kind.ts";

export const steps: readonly Step[] = [
    {
        title: "What is a command?",
        text: "A command is a named script for a console: the lines you would otherwise type by hand, kept in the library.",
        body: [
            "Each command is one markdown file. The frontmatter says what it does and which console runs it; the body is the script itself, written exactly as you would type it at that console's prompt.",
            "Keep a command for a sequence you repeat: deploying to a sandbox, cleaning a branch, regenerating a client. One command does one job; chain two commands only when the second must always follow the first.",
        ],
        example: {
            file: "commands/sf-deploy.md",
            lang: "markdown",
            code: `---
description: Validates and deploys the source to the default org.
shell: git-bash
arguments: [org]
---

sf project deploy validate --target-org "$1"
sf project deploy start --target-org "$1"`,
            note: "Run it as sf-deploy my-sandbox: $1 takes the first word after the name.",
        },
        pitfalls: ["A command is not a prompt for an agent: nothing reads it as instructions, it only runs line by line."],
        fields: ["description"],
        source: "https://git-scm.com/book/en/v2/Getting-Started-The-Command-Line",
    },
    {
        title: "Which console runs it?",
        text: "Shell picks the console: Git Bash, PowerShell or cmd. Write the body in that console's own syntax.",
        body: [
            "Git Bash is the default: POSIX syntax, forward slashes, `$NAME` for variables and `&&` to stop at the first failure. PowerShell takes cmdlets such as `Get-ChildItem`, `$env:NAME` for variables and backtick escapes. cmd takes `%NAME%` and batch syntax.",
            "The same line rarely works in all three. When a command must run in more than one console, keep one command per console with the console in its name, such as `clean-bash` and `clean-pwsh`.",
        ],
        example: {
            file: "commands/clean-pwsh.md",
            lang: "markdown",
            code: `---
description: Removes build output and test results.
shell: powershell
---

Remove-Item -Recurse -Force dist, test-results -ErrorAction SilentlyContinue`,
        },
        pitfalls: ["PowerShell aliases such as rm and ls take PowerShell parameters, not the Unix flags Git Bash expects."],
        fields: ["shell"],
        source: "https://learn.microsoft.com/powershell/scripting/overview",
    },
    {
        title: "How does it take arguments?",
        text: "List the arguments by name; in the body each console reads them its own way.",
        body: [
            "Arguments are documentation for whoever runs the command: their names, in order. Git Bash reads them as `$1`, `$2` or all at once as `$@`; PowerShell as `$args[0]`, `$args[1]`; cmd as `%1`, `%2`.",
            "Quote every argument you pass on, so a value with spaces stays one value: `\"$1\"` in Git Bash, `\"$($args[0])\"` in PowerShell.",
        ],
        pitfalls: ["An unquoted path with spaces splits into several arguments and the command fails far from the cause."],
        fields: ["arguments", "body"],
        source: "https://www.gnu.org/software/bash/manual/bash.html#Positional-Parameters",
    },
];
