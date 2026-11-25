import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Ready } from "@dyarchia/runner";
import { Store } from "@dyarchia/store";
import { z } from "zod";
import pkg from "../../../package.json" with { type: "json" };

/*
 * The agents' door to the board, over stdio. Each tool names its card; the session's PreToolUse guard has already
 * checked that the card is the one this session picked up. Nothing but protocol may reach stdout.
 */
export async function serveMcp() {
    const store = new Store();
    const ready = new Ready(store);
    const server = new McpServer({ name: "aspis", version: pkg.version });
    const answer = async (action: () => string | Promise<string>) => {
        try {
            return { content: [{ type: "text" as const, text: await action() }] };
        } catch (error) {
            return { content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
        }
    };
    const card = z.number().int().describe("The card number this session picked up");

    server.registerTool("card_get", { description: "Show the card this session is working on: brief, files and how to deliver it.", inputSchema: { card } }, ({ card: id }) =>
        answer(() => ready.get(id)),
    );
    server.registerTool(
        "card_note",
        { description: "Leave a note in the card thread for the human.", inputSchema: { card, text: z.string().min(1) } },
        ({ card: id, text }) => answer(() => ready.note(id, text)),
    );
    server.registerTool(
        "card_block",
        { description: "Block the card with a question when you cannot continue without the human. Stop working afterwards.", inputSchema: { card, question: z.string().min(1) } },
        ({ card: id, question }) => answer(() => ready.block(id, question)),
    );
    server.registerTool(
        "card_deliver",
        {
            description: "Deliver the finished card with a summary of what you did. Your changes are committed on the card branch and the card goes to Review.",
            inputSchema: { card, summary: z.string().min(1) },
        },
        ({ card: id, summary }) => answer(() => ready.deliver(id, summary)),
    );

    await server.connect(new StdioServerTransport());
    process.stdin.on("close", () => store.close());
}
