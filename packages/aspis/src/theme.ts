export const themeCatalog = {
    io: { label: "io", description: "Editorial terminal. Warm charcoal, mono structure, zero radius, focus that dims the rest." },
    nyx: { label: "nyx", description: "Near-monochrome dark premium. Pure black, hairlines, bezels and grain, colour only on data." },
} as const;

export type ThemeName = keyof typeof themeCatalog;

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
