import { invoke, isTauri } from "@tauri-apps/api/core";

/*
 * The webview cannot leave the app, so a link to the web would do nothing in the desktop window. Every click on an
 * http(s) link is handed to the system browser instead; in the web build links work as they are. The listener runs
 * in the capture phase and stops the click there: Tauri's shell plugin injects its own handler for target="_blank"
 * links, which would cancel the click and call a command this app does not grant, so nothing would open.
 */
export function openLinksOutside() {
    if (!isTauri()) return;
    window.addEventListener(
        "click",
        (event) => {
            const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href^='http']") : null;
            if (!link) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            void invoke("open_link", { url: link.href });
        },
        { capture: true },
    );
}
