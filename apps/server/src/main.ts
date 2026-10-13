import { Agents, Desktop, Dispatcher, Ready, hookHarnesses } from "@dyarchia/runner";
import { Store } from "@dyarchia/store";
import { defineCommand, runMain } from "citty";
import pkg from "../../../package.json" with { type: "json" };
import { installedExe, wiring } from "./agents.ts";
import { type Extension, startServer } from "./app.ts";
import { serveMcp } from "./mcp.ts";

const serve = (actors?: Extension) =>
    defineCommand({
        meta: { name: "serve", description: "Start the local Aspis server" },
        args: {
            port: { type: "string", default: "0", description: "Port to bind, 0 picks a free one" },
            host: { type: "string", default: "127.0.0.1", description: "Interface to bind" },
            "parent-stdin": { type: "boolean", default: false, description: "Exit when stdin closes (sidecar mode)" },
        },
        run({ args }) {
            const token = process.env.ASPIS_TOKEN;
            if (!token) throw new Error("ASPIS_TOKEN is required");
            const store = new Store();
            const { server, stop } = startServer({ store, token, hostname: args.host, port: Number(args.port), actors });
            const shutdown = () => {
                stop();
                store.close();
                process.exit(0);
            };
            process.on("SIGINT", shutdown);
            process.on("SIGTERM", shutdown);
            if (args["parent-stdin"]) {
                void (async () => {
                    for await (const _ of Bun.stdin.stream());
                    shutdown();
                })();
            }
            console.log(JSON.stringify({ port: server.port }));
        },
    });

const dispatch = defineCommand({
    meta: { name: "dispatch", description: "Start the Scheduled cards that are due, run them to the end and exit" },
    async run() {
        const store = new Store();
        try {
            await new Dispatcher({ store }).dispatch();
        } finally {
            store.close();
        }
    },
});

/*
 * Called by the CLIs' hooks on every prompt, tool call and turn end of every session on the machine, so a session
 * without a card must cost almost nothing, and nothing here may ever break the CLI: any failure lets the call through.
 */
const hook = defineCommand({
    meta: { name: "hook", description: "Handle a CLI hook event read from stdin" },
    args: { harness: { type: "string", required: true, description: "The CLI calling: claude-code or kimi-code" } },
    async run({ args }) {
        let exit = 0;
        try {
            const harness = hookHarnesses.find((candidate) => candidate === args.harness);
            const event = JSON.parse(await Bun.stdin.text());
            if (harness && event.session_id) {
                const store = new Store();
                try {
                    const reply = await new Ready(store).hook(event, harness);
                    if (reply.stdout) process.stdout.write(reply.stdout);
                    if (reply.stderr) process.stderr.write(reply.stderr);
                    exit = reply.exit;
                } finally {
                    store.close();
                }
            }
        } catch (error) {
            process.stderr.write(`aspis hook: ${error instanceof Error ? error.message : String(error)}`);
        }
        process.exit(exit);
    },
});

const mcp = defineCommand({
    meta: { name: "mcp", description: "Serve the aspis MCP tools over stdio" },
    run: () => serveMcp(),
});

const agents = defineCommand({
    meta: { name: "agents", description: "Manage the CLI wiring" },
    subCommands: {
        remove: defineCommand({
            meta: { name: "remove", description: "Remove the hooks, skill and MCP server from every CLI" },
            async run() {
                const exe = installedExe() ?? process.execPath;
                for (const harness of hookHarnesses) await new Agents(wiring(exe)).remove(harness).catch(() => undefined);
            },
        }),
    },
});

const tasks = defineCommand({
    meta: { name: "tasks", description: "Manage the Task Scheduler entries of the Scheduled cards" },
    subCommands: {
        clear: defineCommand({
            meta: { name: "clear", description: "Remove every Task Scheduler entry this app created" },
            async run() {
                const store = new Store();
                try {
                    await new Desktop({ store }).clear();
                } finally {
                    store.close();
                }
            },
        }),
    },
});

export const cli = (actors?: Extension) =>
    defineCommand({
        meta: { name: "aspis-server", version: pkg.version, description: "Dyarchia Aspis local server" },
        subCommands: { serve: serve(actors), dispatch, hook, mcp, agents, tasks },
    });

if (import.meta.main) void runMain(cli());
