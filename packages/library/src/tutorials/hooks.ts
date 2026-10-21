import { type Step, docs } from "../kind.ts";

const json = (value: unknown) => JSON.stringify(value, null, 4);
const script = "\"${CLAUDE_PLUGIN_ROOT}/scripts/guard-prod-deploy.sh\"";
const description = "Blocks Salesforce deploys to the production org";

const handler = { type: "command", if: "Bash(sf project deploy *)", command: script };
const guard = (hooks: Record<string, unknown>[]) => ({ description, hooks: { PreToolUse: [{ matcher: "Bash", hooks }] } });

export const steps: readonly Step[] = [
    {
        title: "What is a hook?",
        text: "A hook is something Claude Code runs on its own at a fixed point of Claude's work, every time, whatever Claude decides.",
        body: [
            "Rules and skills are instructions Claude reads and tries to follow. A hook is different: Claude Code itself runs it when an event fires, such as before a tool call or after a file edit. That makes it the right tool for anything that must always happen, or must never happen, like formatting every edited file or refusing a deploy to production.",
            "A hook can check, record, add context for Claude or block the action. Most hooks run a shell command that receives the event as JSON and answers with an exit code or a JSON object. Hooks can also post to a URL, call an MCP tool, or ask a model to judge.",
            "A hook from this library is a plugin hooks file: a `hooks` object, the same shape as in `settings.json`, plus an optional `description`. Inside a plugin it lives at `hooks/hooks.json` and runs whenever the plugin is enabled. Choose a rule instead when Claude only needs to know something, and a skill when it needs a procedure.",
        ],
        example: {
            file: "hooks/guard-prod-deploy.json",
            lang: "json",
            code: json(guard([handler])),
            note: "Three levels: the event, a matcher group that filters it, and the handlers that run.",
        },
        pitfalls: ["Relying on a CLAUDE.md line to stop a dangerous command: only a hook, or a permission rule, actually blocks it."],
        fields: [],
        source: docs("hooks#configuration"),
    },
    {
        title: "When should your hook run?",
        text: "Pick the event: the point in Claude Code's lifecycle where your check belongs.",
        body: [
            "Events come in three rhythms. `SessionStart` and `SessionEnd` fire once per session. `UserPromptSubmit` and `Stop` fire once per turn. `PreToolUse` and `PostToolUse` fire around every tool call Claude makes.",
            "Choose by what you need to do. To stop something before it happens, use `PreToolUse`: it is the event that can block a tool call. To react after a tool succeeds, such as running a formatter on the file just edited, use `PostToolUse`, but know it cannot undo anything. `Stop` fires whenever Claude finishes responding, not only when a task is done.",
            "The `description` is an optional top-level line in a plugin hooks file. Use it to say in plain words what the hook guards, so whoever installs the plugin knows what it will do on their machine.",
        ],
        example: {
            file: "hooks/guard-prod-deploy.json",
            lang: "json",
            code: json({ description, hooks: { PreToolUse: [] } }),
            note: "Each event name is a key inside the single hooks object.",
        },
        pitfalls: [
            "Trying to block a deploy from `PostToolUse`: by then the command has already run.",
            "Treating `Stop` as task completion: it fires at the end of every response.",
        ],
        fields: ["event", "description"],
        source: docs("hooks#hook-lifecycle"),
    },
    {
        title: "How do you choose which calls it reacts to?",
        text: "A matcher filters the event, so your hook runs only for the tools or sources you name.",
        body: [
            "Without a matcher, or with `*`, a hook fires on every occurrence of its event. For tool events the matcher is tested against the tool name: `Bash`, `Edit`, `Write`, or an MCP tool such as `mcp__github__search_repositories`. Other events match other things, like how a session started for `SessionStart`.",
            "How a matcher is read depends on its characters. Letters, digits, `_`, `-`, spaces, `|` and commas make an exact name or a list of exact names. Anything else turns it into an unanchored JavaScript regular expression, so `Edit.*` also matches `NotebookEdit`; write `^Edit$` for a whole match.",
            "Some events, such as `UserPromptSubmit` and `Stop`, take no matcher. A matcher you add there is silently ignored and the hook fires every time.",
        ],
        example: {
            file: "matcher values",
            lang: "text",
            code: [
                "Bash                   exact: only the Bash tool",
                "Edit|Write             exact list: either tool",
                "mcp__salesforce__.*    regex: every tool of the salesforce MCP server",
                "^Notebook              regex: any tool whose name starts with Notebook",
                "*                      every occurrence of the event",
            ].join("\n"),
            note: "Matchers are case-sensitive: `bash` matches nothing.",
        },
        pitfalls: [
            "`mcp__salesforce` without `.*` is compared as an exact name and matches no tool.",
            "On Windows, where Claude may run shell commands through the PowerShell tool, a `Bash`-only matcher never fires; match `Bash|PowerShell` there.",
        ],
        fields: ["matcher"],
        source: docs("hooks#matcher-patterns"),
    },
    {
        title: "How do you filter by the command itself?",
        text: "The `if` field adds one permission rule, so the handler starts only when the tool's arguments match.",
        body: [
            "A matcher can only see the tool name. `if` sees the arguments too, using permission rule syntax: `Bash(git *)` for git commands, `Edit(*.cls)` for edits to Apex classes. Claude Code skips the handler, and the cost of starting a process, when the call does not match.",
            "For Bash it checks every subcommand, including those joined with `&&` and those inside `$()` or backticks. When Claude Code cannot tell what a command runs, it starts your hook anyway. That makes `if` a filter for efficiency, not a security boundary: a hard allow or deny belongs in permission rules.",
            "`if` holds exactly one rule, with no lists or `&&`. For several conditions, add one handler per rule. It only works on tool events; on any other event, a handler with `if` set never runs.",
        ],
        example: {
            file: "hooks/guard-prod-deploy.json",
            lang: "json",
            code: json(handler),
            note: "`sf project deploy start --target-org prod` matches; `sf org list` never starts the script.",
        },
        pitfalls: [
            "Setting `if` on a `Stop` or `SessionStart` hook: the hook silently never runs.",
            "Counting on `if` alone to block something: your script still has to check the command and decide.",
        ],
        fields: ["if"],
        source: docs("hooks#common-fields"),
    },
    {
        title: "What kind of handler should run?",
        text: "The handler type decides how the hook does its work: a command, a web request, an MCP tool, or a model.",
        body: [
            "`command` runs a shell command and is the usual choice. `http` posts the same event JSON to a `url` and reads the same JSON format back from the response body; a non-2xx status or a failed request is a non-blocking error, so the action goes ahead. `mcp_tool` calls a tool on a configured MCP server.",
            "`prompt` sends your `prompt` and the event to a Claude model for one judgement; `$ARGUMENTS` in the prompt is replaced by the event JSON. The model answers with `ok` and a `reason`. `agent` does the same with a subagent that can read files and run tools; it is experimental, so prefer commands for anything critical.",
            "Not every event runs every type. `SessionStart` and `Setup` take only `command` and `mcp_tool`. Many events, such as `Notification` or `SessionEnd`, take no `prompt` or `agent` handlers. `PreToolUse`, `PostToolUse` and `Stop` take all five, and `PermissionRequest` takes every type except `agent`.",
        ],
        example: {
            file: "hooks/guard-prod-deploy.json",
            lang: "json",
            code: json(
                guard([
                    {
                        type: "prompt",
                        if: "Bash(sf project deploy *)",
                        prompt: "Claude wants to run this Salesforce CLI call: $ARGUMENTS. Answer ok false with a reason if it deploys to the org alias prod, otherwise ok true.",
                    },
                ]),
            ),
            note: "A model-judged variant of the same guard; on `PreToolUse`, `ok: false` denies the call and ends the turn.",
        },
        pitfalls: [
            "Using a prompt hook where a fixed rule would do: it is slower, costs tokens, and can judge differently from one run to the next.",
            "Putting secrets straight into an `http` hook's headers: reference an environment variable and list it in `allowedEnvVars`.",
        ],
        fields: ["type", "url", "prompt"],
        source: docs("hooks#hook-handler-fields"),
    },
    {
        title: "How does a command hook decide?",
        text: "Your command reads the event as JSON on stdin and answers with its exit code.",
        body: [
            "When the event fires, Claude Code writes JSON to your command's stdin: common fields like `session_id` and `cwd`, plus event fields. For `PreToolUse` on Bash, `tool_input.command` holds the exact command Claude wants to run.",
            "Exit 0 means no objection; it does not approve anything, and the normal permission flow still applies. Exit 2 blocks: on `PreToolUse` the call is cancelled and your stderr becomes the reason Claude reads. Any other code, including 1, is a non-blocking error: the action goes ahead and the transcript shows a hook error.",
            "Inside a plugin, point at bundled scripts with `${CLAUDE_PLUGIN_ROOT}`, wrapped in double quotes as here; in a settings file, use `${CLAUDE_PROJECT_DIR}`. To skip the shell entirely, put the program in `command` and its arguments in `args`.",
        ],
        example: {
            file: "scripts/guard-prod-deploy.sh",
            lang: "bash",
            code: [
                "#!/bin/bash",
                "input=$(cat)",
                "command=$(jq -r '.tool_input.command // empty' <<<\"$input\")",
                "",
                "if [[ \"$command\" =~ (--target-org|-o)[[:space:]]+prod([[:space:]]|$) ]]; then",
                "    echo \"Blocked: production deploys run from the release pipeline. Deploy to uat instead.\" >&2",
                "    exit 2",
                "fi",
                "",
                "exit 0",
            ].join("\n"),
            note: "The stderr line is what Claude reads, so make it say what to do instead.",
        },
        pitfalls: [
            "Exiting 1 to block, as Unix habit suggests: Claude Code treats it as a hook error and the deploy runs.",
            "Missing `jq` on the machine: `command` comes out empty, the script exits 0 and every deploy goes through.",
            "Matching paths with forward slashes only: on Windows `tool_input.file_path` arrives with backslashes.",
        ],
        fields: ["command"],
        source: docs("hooks#exit-code-output"),
    },
    {
        title: "When should a hook answer in JSON?",
        text: "Exit 0 and print one JSON object when you need more than block or stay silent.",
        body: [
            "With JSON on stdout a `PreToolUse` hook can choose among `deny`, `ask` and `allow`, give a reason, or add context for Claude. The decision goes inside `hookSpecificOutput`, next to `hookEventName`. `deny` shows the reason to Claude, `ask` shows it to you in the permission prompt.",
            "Pick one style per hook: exit codes alone, or exit 0 with JSON. Print nothing but the object; any other text on stdout, even a line your shell profile echoes, makes Claude Code read it as plain text and ignore your decision. Build the JSON with a tool like `jq` so quotes in your message are escaped.",
            "Other events use other shapes. `PostToolUse` and `Stop` use a top-level `decision: \"block\"` with a `reason`. When several hooks answer the same call, the most restrictive wins: deny, then defer, then ask, then allow.",
        ],
        example: {
            file: "scripts/guard-prod-deploy.sh",
            lang: "bash",
            code: [
                "#!/bin/bash",
                "input=$(cat)",
                "command=$(jq -r '.tool_input.command // empty' <<<\"$input\")",
                "",
                "decide() {",
                "    jq -n --arg decision \"$1\" --arg reason \"$2\" \\",
                "        '{hookSpecificOutput: {hookEventName: \"PreToolUse\", permissionDecision: $decision, permissionDecisionReason: $reason}}'",
                "}",
                "",
                "if [[ \"$command\" =~ (--target-org|-o)[[:space:]]+prod([[:space:]]|$) ]]; then",
                "    decide deny \"Production deploys run from the release pipeline. Deploy to uat instead.\"",
                "elif [[ \"$command\" =~ (--target-org|-o)[[:space:]]+uat([[:space:]]|$) ]]; then",
                "    decide ask \"This deploy changes the shared uat org.\"",
                "fi",
                "",
                "exit 0",
            ].join("\n"),
            note: "Production is refused outright, uat asks you first, anything else stays with the normal permission flow.",
        },
        pitfalls: [
            "Putting `permissionDecision` at the top level: the JSON parses, the field is ignored, and no error appears.",
            "Returning `allow` to wave things through: deny and ask rules from settings still apply over it.",
        ],
        fields: [],
        source: docs("hooks#json-output"),
    },
    {
        title: "How do you keep a hook safe and bounded?",
        text: "A command hook runs with all of your permissions, so make it small, quick and predictable.",
        body: [
            "A command hook can read, change or delete anything your user account can. Review every hook before you install it, especially from a repository or plugin you did not write. In an interactive session Claude Code holds back settings hooks until you trust the folder, but a `claude -p` run treats the folder as trusted and runs them.",
            "Treat the event JSON as untrusted input. Quote every shell variable (`\"$command\"`, not `$command`), reject paths containing `..`, reference scripts by absolute path or a root placeholder, and stay away from `.env` files and keys.",
            "`timeout` sets the seconds before Claude Code cancels the hook; commands default to 600, far more than a guard needs. A `PreToolUse` hook that times out or crashes does not block the call, so a policy hook should also set `onFailure` to `block` (Claude Code 2.1.295 or later). `statusMessage` is the spinner text shown while it runs.",
        ],
        example: {
            file: "hooks/guard-prod-deploy.json",
            lang: "json",
            code: json(guard([{ ...handler, timeout: 30, statusMessage: "Checking the target org", onFailure: "block" }])),
            note: "With `onFailure` set, a missing script or a timeout blocks the deploy instead of letting it through.",
        },
        pitfalls: [
            "Leaving the default timeout on a guard that calls the network: a stalled check holds the session for up to ten minutes and then lets the call through.",
            "Running hooks from an unreviewed repository in a `claude -p` script: they run without any trust dialog.",
        ],
        fields: ["timeout", "statusMessage"],
        source: docs("hooks#security-considerations"),
    },
    {
        title: "How do you try a hook and find out why it misbehaves?",
        text: "Run the script by hand first, then confirm Claude Code registered the hook, then trigger the event.",
        body: [
            "Test the script outside Claude Code by piping it a sample event and checking the exit code. This catches a missing `jq`, a bad path or a wrong regex in seconds. Then type `/hooks` in a session: your hook should be listed under its event with its source, such as the plugin it came from.",
            "Now trigger it for real, for example by asking Claude to deploy to `prod`. A successful hook that exits 0 shows nothing in the transcript, so judge it by its effect. A block shows your reason; a non-blocking error shows a hook error notice with the first line of stderr. Press `Ctrl+O` to open the transcript view.",
            "For the full picture, start Claude Code with `claude --debug` or run `/debug` mid-session. The debug log records each hook's exit status, its output, and lines such as `Hook output does not start with {` when stray text spoils your JSON.",
        ],
        example: {
            file: "terminal",
            lang: "bash",
            code: [
                "echo '{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"sf project deploy start --target-org prod\"}}' | ./scripts/guard-prod-deploy.sh",
                "echo $?",
            ].join("\n"),
            note: "The exit-code version prints the Blocked line on stderr and the second command prints 2.",
        },
        pitfalls: [
            "A hook that never fires is usually a matcher with the wrong case, an event that ignores matchers, or an `if` on a non-tool event.",
            "A notice carrying the shell's own error, such as `No such file or directory`, means the hook never ran: fix the path, and on macOS or Linux make the script executable with `chmod +x`.",
        ],
        fields: [],
        source: docs("hooks-guide#limitations-and-troubleshooting"),
    },
];
