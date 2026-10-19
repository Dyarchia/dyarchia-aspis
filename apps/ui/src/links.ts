import { invoke, isTauri } from "@tauri-apps/api/core";

/*
 * The webview cannot leave the app, so a link to the web would do nothing in the desktop window. Every click on an
 * http(s) link is handed to the system browser instead; in the web build links work as they are.
 */
export function openLinksOutside() {
    if (!isTauri()) return;
    document.addEventListener("click", (event) => {
        const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href^='http']") : null;
        if (!link || event.defaultPrevented) return;
        event.preventDefault();
        void invoke("open_link", { url: link.href });
    });
}
