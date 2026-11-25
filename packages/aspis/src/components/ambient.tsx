import { type ReactNode, useEffect, useRef, useState } from "react";

/*
 * Synthic's Ambient, ported from its bundle: in dark (Space) a star field that drifts, twinkles, follows the pointer
 * by parallax and now and then crosses a shooting star; in light (Earth) contour lines that slide slowly with one
 * level picked out in moss. It goes behind empty or welcome screens only, one per screen, and stands still under
 * prefers-reduced-motion. Stars come from a seeded generator, so a still frame is the same on every run.
 */

const hash = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
};

const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

const field = (x: number, y: number, t: number) => noise(x + t * 0.05, y + t * 0.02) * 0.65 + noise(x * 2.1 - t * 0.03, y * 2.1 + 3.7) * 0.35;

const seeded = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const rgba = (color: string, alpha: number) => {
    const hex = color.replace("#", "").slice(0, 6);
    const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
    return `rgba(${r},${g},${b},${alpha})`;
};

function useTheme() {
    const read = () => document.documentElement.dataset.theme ?? "dark";
    const [theme, setTheme] = useState(read);
    useEffect(() => {
        const observer = new MutationObserver(() => setTheme(read()));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);
    return theme;
}

type Point = readonly [number, number];

interface Star {
    x: number;
    y: number;
    z: number;
    r: number;
    p: number;
    s: number;
    c: string;
}

export function Ambient({ children }: { children?: ReactNode }) {
    const wrap = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const theme = useTheme();
    const mode = theme === "light" ? "contours" : "stars";

    useEffect(() => {
        const element = wrap.current!;
        const surface = canvas.current!;
        const context = surface.getContext("2d")!;
        const style = getComputedStyle(element);
        const token = (name: string) => style.getPropertyValue(`--${name}`).trim();
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const ratio = Math.min(devicePixelRatio || 1, 2);
        const ink = token("ink");
        const tints = ["sky", "nebula", "sun"].map(token);
        const moss = token("moss");
        const random = seeded(7);
        const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
        const t0 = performance.now();
        let width = 0;
        let height = 0;
        let frame = 0;
        let last = 0;
        let stars: Star[] = [];
        let shooting: { x: number; y: number; vx: number; vy: number; life: number } | undefined;
        let nextShot = 4000 + random() * 6000;

        const drawStars = (now: number, dt: number) => {
            context.clearRect(0, 0, width, height);
            mouse.x += (mouse.tx - mouse.x) * 0.04;
            mouse.y += (mouse.ty - mouse.y) * 0.04;
            for (const star of stars) {
                if (!reduced) {
                    star.x += star.z * dt * 0.006;
                    if (star.x > width + 4) star.x = -4;
                }
                const twinkle = reduced ? 1 : 0.65 + 0.35 * Math.sin(now * 0.001 * star.s + star.p);
                const x = star.x + mouse.x * star.z * 14;
                const y = star.y + mouse.y * star.z * 10;
                context.globalAlpha = (0.18 + star.z * 0.7) * twinkle;
                context.fillStyle = star.c;
                context.beginPath();
                context.arc(x, y, star.r, 0, Math.PI * 2);
                context.fill();
                if (star.z > 0.85 && twinkle > 0.9) {
                    context.globalAlpha = 0.08 * twinkle;
                    context.beginPath();
                    context.arc(x, y, star.r * 4, 0, Math.PI * 2);
                    context.fill();
                }
            }
            context.globalAlpha = 1;
            if (reduced) return;
            nextShot -= dt;
            if (!shooting && nextShot <= 0) {
                shooting = { x: random() * width * 0.7, y: random() * height * 0.4, vx: 0.9 + random() * 0.6, vy: 0.35 + random() * 0.25, life: 0 };
                nextShot = 9000 + random() * 12000;
            }
            if (shooting) {
                shooting.life += dt;
                const k = shooting.life / 900;
                const hx = shooting.x + shooting.vx * shooting.life;
                const hy = shooting.y + shooting.vy * shooting.life;
                const tail = context.createLinearGradient(hx, hy, hx - shooting.vx * 120, hy - shooting.vy * 120);
                const alpha = Math.sin(Math.min(1, k) * Math.PI);
                tail.addColorStop(0, rgba(ink, 0.9 * alpha));
                tail.addColorStop(1, rgba(ink, 0));
                context.strokeStyle = tail;
                context.lineWidth = 1.2;
                context.lineCap = "round";
                context.beginPath();
                context.moveTo(hx, hy);
                context.lineTo(hx - shooting.vx * 120, hy - shooting.vy * 120);
                context.stroke();
                if (k >= 1) shooting = undefined;
            }
        };

        const drawContours = (now: number) => {
            context.clearRect(0, 0, width, height);
            const t = reduced ? 0 : (now - t0) / 1000;
            const cell = 12;
            const scale = 1 / 220;
            const cols = Math.ceil(width / cell) + 1;
            const rows = Math.ceil(height / cell) + 1;
            const values = new Float32Array(cols * rows);
            for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) values[j * cols + i] = field(i * cell * scale + mouse.x * 0.04, j * cell * scale + mouse.y * 0.04, t);
            const levels = 9;
            for (let level = 1; level < levels; level++) {
                const iso = level / levels;
                const picked = level === 5;
                context.strokeStyle = picked ? rgba(moss, 0.38) : rgba(ink, 0.1);
                context.lineWidth = picked ? 1.2 : 1;
                context.beginPath();
                for (let y = 0; y < rows - 1; y++)
                    for (let x = 0; x < cols - 1; x++) {
                        const a = values[y * cols + x]!;
                        const b = values[y * cols + x + 1]!;
                        const c = values[(y + 1) * cols + x + 1]!;
                        const d = values[(y + 1) * cols + x]!;
                        const index = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
                        if (index === 0 || index === 15) continue;
                        const X = x * cell;
                        const Y = y * cell;
                        const top = [X + (cell * (iso - a)) / (b - a), Y] as const;
                        const right = [X + cell, Y + (cell * (iso - b)) / (c - b)] as const;
                        const bottom = [X + (cell * (iso - d)) / (c - d), Y + cell] as const;
                        const left = [X, Y + (cell * (iso - a)) / (d - a)] as const;
                        const segments: Record<number, (readonly [Point, Point])[]> = {
                            1: [[left, bottom]],
                            2: [[bottom, right]],
                            3: [[left, right]],
                            4: [[top, right]],
                            5: [[left, top], [bottom, right]],
                            6: [[top, bottom]],
                            7: [[left, top]],
                            8: [[left, top]],
                            9: [[top, bottom]],
                            10: [[top, right], [left, bottom]],
                            11: [[top, right]],
                            12: [[left, right]],
                            13: [[bottom, right]],
                            14: [[left, bottom]],
                        };
                        for (const [from, to] of segments[index]!) {
                            context.moveTo(from[0], from[1]);
                            context.lineTo(to[0], to[1]);
                        }
                    }
                context.stroke();
            }
        };

        const draw = (now: number) => {
            const dt = last ? Math.min(64, now - last) : 16;
            last = now;
            if (mode === "stars") drawStars(now, dt);
            else drawContours(now);
        };

        const resize = () => {
            const box = element.getBoundingClientRect();
            width = box.width;
            height = box.height;
            surface.width = Math.round(width * ratio);
            surface.height = Math.round(height * ratio);
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            if (mode === "stars") {
                const count = Math.round((width * height) / 2600);
                const place = seeded(42);
                stars = Array.from({ length: count }, (_, index) => {
                    const z = Math.pow(place(), 2.2) * 0.9 + 0.1;
                    return { x: place() * width, y: place() * height, z, r: 0.35 + z * 1.15, p: place() * Math.PI * 2, s: 0.4 + place() * 1.6, c: place() < 0.08 ? tints[index % 3]! : ink };
                });
            }
            draw(performance.now());
        };

        const gap = mode === "stars" ? 0 : 66;
        const loop = (now: number) => {
            frame = requestAnimationFrame(loop);
            if (gap && now - last < gap) return;
            draw(now);
        };
        const move = (event: PointerEvent) => {
            const box = element.getBoundingClientRect();
            mouse.tx = (event.clientX - box.left) / box.width - 0.5;
            mouse.ty = (event.clientY - box.top) / box.height - 0.5;
        };
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        if (!reduced) {
            addEventListener("pointermove", move);
            frame = requestAnimationFrame(loop);
        }
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            removeEventListener("pointermove", move);
        };
    }, [mode]);

    return (
        <div ref={wrap} className="aspis-ambient">
            <canvas ref={canvas} className="aspis-ambient__canvas" aria-hidden="true" />
            {children && <div className="aspis-ambient__content">{children}</div>}
        </div>
    );
}
