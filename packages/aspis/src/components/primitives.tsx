import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, createElement } from "react";
import { icons } from "./icons.ts";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export type IconName = keyof typeof icons;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
    const { box, parts } = icons[name];
    return (
        <svg className={cx("aspis-icon", className)} width={size} height={size} viewBox={`0 0 ${box} ${box}`} fill="currentColor" aria-hidden="true">
            {parts.map(([Tag, attrs], index) => createElement(Tag, { key: index, ...attrs }))}
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
