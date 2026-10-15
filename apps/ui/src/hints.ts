/*
 * Per-viewer conveniences only: the last view, the last settings section and a first-paint guess of the theme. The
 * theme itself lives in state.db; storage may be unavailable, so every access is guarded and a miss falls back to
 * defaults.
 */
export function readHint(key: string): string | undefined {
    try {
        return localStorage.getItem(`aspis.${key}`) ?? undefined;
    } catch {
        return undefined;
    }
}

export function writeHint(key: string, value: string) {
    try {
        localStorage.setItem(`aspis.${key}`, value);
    } catch {}
}
