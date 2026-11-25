import { invoke, isTauri } from "@tauri-apps/api/core";

/*
 * Windows draws the title bar and Aspis only paints it: the caption takes the theme's ground and the window edge
 * the hairline between panes. The title is painted in the caption's own colour, so the bar shows only the icon and
 * Windows' buttons while the taskbar and Alt Tab still name the window; the sidebar already names the app. Tokens
 * may carry alpha, so each colour is laid over the ground on a one-pixel canvas and read back as the opaque colour
 * the eye sees.
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
        caption: seen("--ground"),
        text: seen("--ground"),
        border: seen("--ground", "--hairline"),
    }).catch(() => undefined);
}
