import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { type ITheme, Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { SynScreen, readPalette } from "./syn.ts";

/*
 * The Synthic Space and Synthic Earth schemes from the design system's Windows Terminal settings, so the session
 * looks as syn will in the user's own terminal. The background is the ground: the TUI never paints its own.
 */
const schemes: Record<"dark" | "light", ITheme> = {
    dark: {
        background: "#141413",
        foreground: "#f3f1ec",
        cursor: "#f3f1ec",
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
        background: "#f3f1ea",
        foreground: "#1c1b18",
        cursor: "#1c1b18",
        selectionBackground: "#e4e0d5",
        black: "#1c1b18",
        red: "#a0472a",
        green: "#2a6e2f",
        yellow: "#7d570c",
        blue: "#2361b0",
        magenta: "#7449b0",
        cyan: "#186a60",
        white: "#dcd8cc",
        brightBlack: "#5d5b54",
        brightRed: "#833a22",
        brightGreen: "#225a27",
        brightYellow: "#67470a",
        brightBlue: "#1d5090",
        brightMagenta: "#5f3c90",
        brightCyan: "#14574f",
        brightWhite: "#fbfaf7",
    },
};

const theme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

/*
 * One session: xterm.js fitted to its pane, running the syn mock. The terminal opens once Google Sans Code has
 * loaded, so cells are measured on the real font, and draws through WebGL, which paints box and block characters
 * itself and keeps every line on the cell grid (Windows Terminal's builtin glyphs do the same); without WebGL the DOM
 * renderer takes over. The mock repaints in
 * truecolor from the live tokens, so a theme switch recolours both the scheme and the TUI on the next frame. Under
 * reduced motion the screen only redraws when something changes.
 */
export function Terminal({ project, label }: { project: string; label: string }) {
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
    }, [project, label]);

    const start = () => {
        const terminal = new XTerm({
            theme: schemes[theme()],
            fontFamily: '"Google Sans Code Variable", "Google Sans Code", ui-monospace, monospace',
            fontSize: 13,
            lineHeight: 1,
            cursorBlink: false,
            allowProposedApi: false,
            screenReaderMode: false,
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
        const screen = new SynScreen(terminal.cols, terminal.rows, readPalette(), () => (theme() === "light" ? "contours" : "stars"), project);
        const draw = () => terminal.write(screen.render());
        const refit = () => {
            fit.fit();
            screen.resize(terminal.cols, terminal.rows);
            draw();
        };
        refit();
        const typing = terminal.onData((data) => {
            screen.key(data);
            draw();
        });
        const sized = new ResizeObserver(refit);
        sized.observe(host.current!);
        const themed = new MutationObserver(() => {
            terminal.options.theme = schemes[theme()];
            screen.repaint(readPalette());
            draw();
        });
        themed.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const timer = still
            ? undefined
            : setInterval(() => {
                  screen.tick();
                  draw();
              }, 120);
        terminal.focus();
        return () => {
            clearInterval(timer);
            typing.dispose();
            sized.disconnect();
            themed.disconnect();
            terminal.dispose();
        };
    };

    return <div ref={host} className="aspis-terminal" />;
}
