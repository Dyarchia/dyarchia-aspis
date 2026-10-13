import { Dispatcher } from "@dyarchia/runner";
import { Store } from "@dyarchia/store";
import { defineCommand, runMain } from "citty";
import pkg from "../../../package.json" with { type: "json" };
import { type Extension, startServer } from "./app.ts";

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

export const cli = (actors?: Extension) =>
    defineCommand({
        meta: { name: "aspis-server", version: pkg.version, description: "Dyarchia Aspis local server" },
        subCommands: { serve: serve(actors), dispatch },
    });

if (import.meta.main) void runMain(cli());
