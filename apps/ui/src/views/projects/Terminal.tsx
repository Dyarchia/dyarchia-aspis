import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { type ITheme, Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import type { Connection } from "../../server.ts";

/*
 * The Synthic Space and Synthic Earth schemes from the design system's Windows Terminal settings, so a session looks
 * as it would in the user's own terminal and a TUI that leaves the background alone sits on the ground.
 */
const schemes: Record<"dark" | "light", ITheme> = {
    dark: {
        background: "#141413",
        foreground: "#f3f1ec",
        cursor: "#f3f1ec",
        cursorAccent: "#141413",
        selectionBackground: "#24241f",
        black: "#2b2a28",
        red: "#e2735a",
        green: "#53c556",
        yellow: "#e0a53a",
        blue: "#4a90e8",
        magenta: "#b08ae6",
        cyan: "#3fb8a9",
        white: "#a3a19a",
        brightBlack: "#6e6c66",
        brightRed: "#e99683",
        brightGreen: "#7ed480",
        brightYellow: "#e8bc6b",
        brightBlue: "#77acee",
        brightMagenta: "#c4a7ec",
        brightCyan: "#6fcabe",
        brightWhite: "#f3f1ec",
    },
    light: {
        background: "#e8e8e5",
        foreground: "#141414",
        cursor: "#141414",
        cursorAccent: "#e8e8e5",
        selectionBackground: "#d8d8d4",
        black: "#141414",
        red: "#7e2401",
        green: "#035814",
        yellow: "#624001",
        blue: "#024884",
        magenta: "#5d02a5",
        cyan: "#01544d",
        white: "#d6d6d2",
        brightBlack: "#3d3d3b",
        brightRed: "#ab3503",
        brightGreen: "#03791f",
        brightYellow: "#855904",
        brightBlue: "#0364b4",
        brightMagenta: "#8002df",
        brightCyan: "#00736a",
        brightWhite: "#f0f0ee",
    },
};

const theme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

/*
 * One session: xterm.js fitted to its pane and wired to the server's PTY over a WebSocket. Output arrives as raw bytes
 * and is written as bytes, so a UTF-8 character split across two chunks is never mangled; keys go back as input and
 * every refit tells the PTY the new size. The terminal opens once Google Sans Code has loaded, so cells are measured
 * on the real font, and draws through WebGL, which paints box and block characters itself and keeps every line on
 * the cell grid; without WebGL the DOM renderer takes over. Leaving the view only detaches: the shell keeps running
 * and the server replays what it printed when the session is shown again.
 */
export function Terminal({ conn, id, label }: { conn: Connection; id: string; label: string }) {
    const host = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let stop = () => undefined as void;
        let cancelled = false;
        void document.fonts.load('13px "Google Sans Code Variable"').finally(() => {
            if (!cancelled) stop = start();
        });
        return () => {
            cancelled = true;
            stop();
        };
    }, [conn, id, label]);

    const start = () => {
        const terminal = new XTerm({
            theme: schemes[theme()],
            fontFamily: '"Google Sans Code Variable", "Google Sans Code", ui-monospace, monospace',
            fontSize: 13,
            lineHeight: 1,
            cursorStyle: "bar",
            cursorBlink: !matchMedia("(prefers-reduced-motion: reduce)").matches,
            scrollback: 5000,
        });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(host.current!);
        try {
            const webgl = new WebglAddon();
            webgl.onContextLoss(() => webgl.dispose());
            terminal.loadAddon(webgl);
        } catch {}
        terminal.textarea?.setAttribute("aria-label", label);

        const socket = new WebSocket(`${conn.base.replace(/^http/, "ws")}/terminals/${id}/ws?token=${encodeURIComponent(conn.token)}`);
        socket.binaryType = "arraybuffer";
        const send = (message: object) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));
        const size = () => send({ type: "resize", cols: terminal.cols, rows: terminal.rows });
        socket.onopen = size;
        socket.onmessage = (event) => terminal.write(new Uint8Array(event.data as ArrayBuffer));
        const typing = terminal.onData((data) => send({ type: "input", data }));
        const resized = terminal.onResize(size);
        const refit = () => {
            if (host.current?.offsetWidth) fit.fit();
        };
        refit();
        const sized = new ResizeObserver(refit);
        sized.observe(host.current!);
        const themed = new MutationObserver(() => (terminal.options.theme = schemes[theme()]));
        themed.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        terminal.focus();
        return () => {
            socket.onmessage = null;
            socket.close();
            typing.dispose();
            resized.dispose();
            sized.disconnect();
            themed.disconnect();
            terminal.dispose();
        };
    };

    return <div ref={host} className="aspis-terminal" />;
}
