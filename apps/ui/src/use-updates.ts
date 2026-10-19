import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

const repo = "Dyarchia/dyarchia-aspis";
const Release = z.object({ tag_name: z.string(), draft: z.boolean() });
const UpdateInfo = z.object({ version: z.string(), current: z.string(), notes: z.string().nullable() });
export type UpdateInfo = z.infer<typeof UpdateInfo>;

export type UpdateState =
    | { kind: "unsupported" }
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "current" }
    | { kind: "available"; info: UpdateInfo }
    | { kind: "installing"; info: UpdateInfo }
    | { kind: "error"; message: string };

/*
 * Releases are prereleases, which GitHub's "latest" skips, so the newest tag comes from the releases API and its
 * latest.json is what the desktop shell checks and verifies against the bundled public key.
 */
async function newestManifest() {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, { headers: { accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const newest = z
        .array(Release)
        .parse(await res.json())
        .find((release) => !release.draft);
    if (!newest) throw new Error("No release published yet");
    return `https://github.com/${repo}/releases/download/${newest.tag_name}/latest.json`;
}

const checkEvery = 6 * 60 * 60 * 1000;
const recheck = 10 * 60 * 1000;

export function useUpdates(onAvailable: (info: UpdateInfo) => void) {
    const supported = isTauri();
    const [state, setState] = useState<UpdateState>(supported ? { kind: "idle" } : { kind: "unsupported" });
    const notify = useRef(onAvailable);
    notify.current = onAvailable;
    const told = useRef<string | undefined>(undefined);

    const check = useCallback(async () => {
        if (!supported) return;
        setState({ kind: "checking" });
        try {
            const info = UpdateInfo.nullable().parse(await invoke("check_update", { manifest: await newestManifest() }));
            setState(info ? { kind: "available", info } : { kind: "current" });
            if (info && info.version !== told.current) {
                told.current = info.version;
                notify.current(info);
            }
        } catch (reason) {
            setState({ kind: "error", message: String(reason) });
        }
    }, [supported]);

    const install = useCallback(async () => {
        if (state.kind !== "available") return;
        setState({ kind: "installing", info: state.info });
        try {
            await invoke("install_update");
        } catch (reason) {
            setState({ kind: "error", message: String(reason) });
        }
    }, [state]);

    /*
     * A release lands minutes after its merge, so the app looks again whenever the window comes back to the front, at
     * most every ten minutes, besides once at start and every six hours; each version is announced once.
     */
    useEffect(() => {
        if (!supported) return;
        let last = 0;
        const look = () => {
            if (Date.now() - last < recheck) return;
            last = Date.now();
            void check();
        };
        const first = setTimeout(look, 4000);
        const later = setInterval(look, checkEvery);
        window.addEventListener("focus", look);
        return () => {
            clearTimeout(first);
            clearInterval(later);
            window.removeEventListener("focus", look);
        };
    }, [supported, check]);

    return { state, check, install };
}

export type Updates = ReturnType<typeof useUpdates>;
