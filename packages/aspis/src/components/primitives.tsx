import type { ButtonHTMLAttributes, ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const paths = {
    home: "M2.5 7.5L8 3l5.5 4.5M4 6.5V13h8V6.5",
    board: "M2.5 3h3v10h-3zM6.5 3h3v7h-3zM10.5 3h3v5h-3z",
    layers: "M8 2.5l5.5 3L8 8.5 2.5 5.5zM2.5 8L8 11l5.5-3M2.5 10.5L8 13.5l5.5-3",
    shield: "M8 2.5l4.5 1.5v4c0 3-2.2 4.7-4.5 5.5C5.7 12.7 3.5 11 3.5 8V4z",
    settings: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4",
    inbox: "M2.5 9.5h3l1 2h3l1-2h3M3 4.5l-.5 5v3.5h11V9.5l-.5-5z",
    agents: "M3 3l4 10 1.5-4.5L13 7zM10 10l3 3",
    history: "M8 3a5 5 0 1 1-4.6 3M3 3v3h3M8 5.5V8l2 1.5",
    pulse: "M2 8h3l1.5-4 3 8L11 8h3",
    calendar: "M3 4h10v9H3zM3 7h10M6 2.5v3M10 2.5v3",
    clock: "M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3zM8 5v3l2 1",
    check: "M3.5 8.5l3 3 6-7",
    search: "M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM10 10l3 3",
    edit: "M4 12l1-3 6-6 2 2-6 6zM10 4l2 2",
    chevron: "M5 6.5l3 3 3-3",
    filter: "M2.5 4h11M4.5 8h7M6.5 12h3",
    spark: "M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M6 10l-2 2",
    bolt: "M9 2L4 9h4l-1 5 5-7H8z",
    terminal: "M3 4.5l3 3.5-3 3.5M8 12h5",
    plus: "M8 3v10M3 8h10",
    close: "M4 4l8 8M12 4l-8 8",
    copy: "M5.5 5.5h7v7h-7zM3.5 10.5v-7h7",
    arrow: "M3 8h10M9 4l4 4-4 4",
    external: "M6 3.5H3.5v9h9V10M9 3h4v4M13 3L7.5 8.5",
} as const;

export type IconName = keyof typeof paths;
export const iconNames = Object.keys(paths) as IconName[];

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
    return (
        <svg className={cx("aspis-icon", className)} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
            <path d={paths[name]} />
        </svg>
    );
}

export function Kbd({ children }: { children: ReactNode }) {
    return <kbd className="aspis-kbd">{children}</kbd>;
}

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
        <button type={type} className={cx("aspis-button", className)} data-variant={variant} {...rest}>
            <span className="aspis-button__glint" aria-hidden="true" />
            <span className="aspis-button__label">
                {icon && <Icon name={icon} />}
                {children}
                {hotkey && <Kbd>{hotkey}</Kbd>}
            </span>
        </button>
    );
}

export function Divider() {
    return <hr className="aspis-divider" />;
}
