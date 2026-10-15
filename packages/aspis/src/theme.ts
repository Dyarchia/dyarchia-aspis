export type ThemeName = "io" | "nyx";

let settle: ReturnType<typeof setTimeout> | undefined;

export function applyTheme(theme: ThemeName) {
    const root = document.documentElement;
    if (root.dataset.theme === theme) return;
    if (root.dataset.theme) {
        root.dataset.themeSwitching = "";
        clearTimeout(settle);
        settle = setTimeout(() => delete root.dataset.themeSwitching, 450);
    }
    root.dataset.theme = theme;
}
