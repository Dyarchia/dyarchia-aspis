/*
 * Stands in for `claude -p --output-format stream-json` in tests and e2e, where the real CLI and its login are not
 * available. Markers in the prompt or in the card title, which the system prompt carries into every attempt, pick
 * the behaviour: #fail-always, #fail-once (fails until resumed), #block (asks until the human answers), #slow
 * (works until killed). As the auditor it passes, or fails with #audit-fail, or forgets the verdict with
 * #audit-mute. Anything else writes a note into the repository.
 */
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const prompt = await new Response(Bun.stdin.stream()).text();
const flag = (name: string) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
};
const session = flag("--resume") ?? flag("--session-id") ?? "none";
const resumed = args.includes("--resume");
const context = [prompt, flag("--append-system-prompt") ?? ""].join("\n");
const emit = (event: unknown) => console.log(JSON.stringify(event));
const say = (text: string) => {
    for (const piece of text.match(/.{1,6}/gs) ?? []) emit({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: piece } } });
    emit({ type: "assistant", message: { content: [{ type: "text", text }] } });
};
const finish = (result: string, isError = false) => {
    emit({ type: "result", subtype: isError ? "error_during_execution" : "success", is_error: isError, result, duration_ms: 1200, num_turns: 2, total_cost_usd: 0.01, session_id: session });
    process.exit(isError ? 1 : 0);
};

emit({ type: "system", subtype: "init", session_id: session, model: "fake-claude", cwd: process.cwd(), args });

if (prompt.includes("You are the auditor")) {
    say("Reading the branch.");
    if (context.includes("#audit-mute")) finish("Looks fine to me.");
    finish(context.includes("#audit-fail") ? "Checked.\nVERDICT: FAIL The tests are missing" : "Checked.\nVERDICT: PASS The branch does what the brief asks");
}
if (context.includes("#fail-always") || (context.includes("#fail-once") && !resumed)) finish("The API went away", true);
if (context.includes("#block") && !prompt.startsWith("The human answered")) {
    say("I looked at the flows.");
    finish("I looked at the flows.\nBLOCKED: Which org has the failing flow?");
}
if (context.includes("#slow")) {
    say("Working on it");
    await Bun.sleep(60_000);
}

say("Writing the note.");
emit({ type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "note.md" } }] } });
writeFileSync(`note-${Date.now()}.md`, prompt);
emit({ type: "user", message: { content: [{ type: "tool_result", content: "File written" }] } });
finish("Wrote the note.");
