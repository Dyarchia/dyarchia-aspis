import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/*
 * Lucide's outlines on its 24 unit grid, the set shadcn uses, so every icon shares one stroke and one optical size.
 * Rectangles and circles are written as paths so each icon is a single path.
 */
const paths = {
    home: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    board: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7v7M12 7v4M16 7v9",
    layers: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83zM22 17.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65M22 12.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65",
    settings:
        "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    history: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2",
    check: "M20 6 9 17l-5-5",
    search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.3-4.3",
    chevron: "m6 9 6 6 6-6",
    next: "m9 18 6-6-6-6",
    plus: "M5 12h14M12 5v14",
    expand: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
    collapse: "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7",
    trash: "M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",
    clip: "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48",
    sliders: "M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4",
    close: "M18 6 6 18M6 6l12 12",
    arrow: "M5 12h14M12 5l7 7-7 7",
    external: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
    folder: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z",
    open: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
    file: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7zM14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8",
    archive: "M3 3h18a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4",
    panel: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18",
    alert: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
    return (
        <svg className={cx("aspis-icon", className)} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d={paths[name]} />
        </svg>
    );
}

export function Kbd({ children, ...rest }: { children: ReactNode } & HTMLAttributes<HTMLElement>) {
    return (
        <kbd className="aspis-kbd" {...rest}>
            {children}
        </kbd>
    );
}

export function VisuallyHidden({ children, ...rest }: { children: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
    return (
        <span className="aspis-sr" {...rest}>
            {children}
        </span>
    );
}

const keyshortcut = (hotkey: string) => hotkey.split(" ").map((part) => (part === "Ctrl" ? "Control" : part)).join("+");

export type Tone = "ok" | "warn" | "danger" | "info" | "idle";

export function Status({ tone = "ok", children }: { tone?: Tone; children: ReactNode }) {
    return (
        <span className="aspis-status" data-tone={tone}>
            <i className="aspis-status__dot" aria-hidden="true" />
            <span className="aspis-status__label">{children}</span>
        </span>
    );
}

export function Chip({ tone, children }: { tone?: Tone; children: ReactNode }) {
    return (
        <span className="aspis-chip" data-tone={tone}>
            {tone && <i className="aspis-chip__dot" aria-hidden="true" />}
            {children}
        </span>
    );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "quiet";
    icon?: IconName;
    hotkey?: string;
}

export function Button({ variant = "secondary", icon, hotkey, className, children, type = "button", ...rest }: ButtonProps) {
    return (
        <button type={type} className={cx("aspis-button", className)} data-variant={variant} aria-keyshortcuts={hotkey && keyshortcut(hotkey)} {...rest}>
            <span className="aspis-button__glint" aria-hidden="true" />
            <span className="aspis-button__label">
                {icon && <Icon name={icon} />}
                {children}
            </span>
        </button>
    );
}

export function IconButton({ icon, label, hotkey, className, type = "button", ...rest }: { icon: IconName; label: string; hotkey?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button type={type} className={cx("aspis-icon-button", className)} aria-label={label} title={label} aria-keyshortcuts={hotkey && keyshortcut(hotkey)} {...rest}>
            <Icon name={icon} />
        </button>
    );
}
