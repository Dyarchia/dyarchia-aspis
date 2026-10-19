import { invoke, isTauri } from "@tauri-apps/api/core";

/*
 * Windows draws the title bar and Aspis only paints it: the caption takes the theme's background, the title its
 * quiet ink and the window edge the line between panes. Tokens may carry alpha, so each colour is laid over the
 * background on a one-pixel canvas and read back as the opaque colour the eye sees.
 */
export function paintFrame() {
    if (!isTauri()) return;
    const style = getComputedStyle(document.documentElement);
    const pixel = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const seen = (...layers: string[]) => {
        for (const layer of layers) {
            pixel.fillStyle = style.getPropertyValue(layer).trim();
            pixel.fillRect(0, 0, 1, 1);
        }
        const [r, g, b] = pixel.getImageData(0, 0, 1, 1).data;
        return `#${[r, g, b].map((channel) => channel!.toString(16).padStart(2, "0")).join("")}`;
    };
    void invoke("paint_frame", {
        caption: seen("--aspis-bg"),
        text: seen("--aspis-bg", "--aspis-ink-3"),
        border: seen("--aspis-bg", "--aspis-line"),
    }).catch(() => undefined);
}
