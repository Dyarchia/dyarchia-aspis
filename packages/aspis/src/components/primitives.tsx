import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const paths = {
    home: "M2.5 7.5L8 3l5.5 4.5M4 6.5V13h8V6.5",
    board: "M2.5 3h3v10h-3zM6.5 3h3v7h-3zM10.5 3h3v5h-3z",
    layers: "M8 2.5l5.5 3L8 8.5 2.5 5.5zM2.5 8L8 11l5.5-3M2.5 10.5L8 13.5l5.5-3",
    settings: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4",
    history: "M8 3a5 5 0 1 1-4.6 3M3 3v3h3M8 5.5V8l2 1.5",
    check: "M3.5 8.5l3 3 6-7",
    search: "M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM10 10l3 3",
    chevron: "M5 6.5l3 3 3-3",
    plus: "M8 3v10M3 8h10",
    expand: "M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9",
    collapse: "M13.5 2.5L9.5 6.5M9.5 3v3.5H13M2.5 13.5l4-4M6.5 13V9.5H3",
    trash: "M2.5 4.5h11M6.5 4.5v-2h3v2M4 4.5l.6 9h6.8l.6-9",
    clip: "M11 5.5l-5 5a1.4 1.4 0 0 0 2 2l5.5-5.5a2.8 2.8 0 0 0-4-4L4 8.5a4.2 4.2 0 0 0 6 6l4-4",
    sliders: "M2.5 5h5M10.5 5h3M9 3.5v3M2.5 11h2M7.5 11h6M6 9.5v3",
    close: "M4 4l8 8M12 4l-8 8",
    arrow: "M3 8h10M9 4l4 4-4 4",
    external: "M6 3.5H3.5v9h9V10M9 3h4v4M13 3L7.5 8.5",
    folder: "M2.5 3.5H6L7.5 5h6v7.5h-11z",
    archive: "M2.5 3.5h11V6h-11zM3.5 6v6.5h9V6M6.5 8.5h3",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
    return (
        <svg className={cx("aspis-icon", className)} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
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

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
    return <progress className="aspis-progress" max={max} value={value} aria-label={label} />;
}
