/*
 * A stand-in for syn, the TUI still to be written, drawn as Synthic's TUI guide asks so both themes can be judged in
 * a real terminal: the cell is the unit, colours are Synthic's tokens in truecolor, the app never paints the
 * ground (the terminal's background already is it), labels are mono capitals in ink-muted, tiles are 5 by 3 blocks
 * in their tint with the glyph in their colour, what floats has rounded corners in hairline with a light top edge and
 * a veil over the rest, and the one spectacle is a star field (Space) or contour lines (Earth) in quarter blocks.
 * Nothing runs: typed lines are echoed and answered as a mock.
 */

type Rgb = readonly [number, number, number];

interface Cell {
    ch: string;
    fg?: Rgb;
    bg?: Rgb;
}

export type Palette = Record<(typeof tokenNames)[number], Rgb>;

const tokenNames = [
    "ground",
    "ground-raised",
    "ground-hover",
    "hairline",
    "ink",
    "ink-muted",
    "ink-faint",
    "primary-fill",
    "on-primary",
    "up",
    "moss",
    "moss-tile",
    "clay",
    "clay-tile",
    "sky",
    "sky-tile",
    "sun",
    "sun-tile",
    "nebula",
    "nebula-tile",
    "tide",
    "tide-tile",
] as const;

const hex = (value: string): Rgb => {
    const digits = value.trim().replace("#", "").slice(0, 6);
    return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16)) as unknown as Rgb;
};

export const readPalette = (): Palette => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(tokenNames.map((name) => [name, hex(style.getPropertyValue(`--${name}`))])) as Palette;
};

const mix = (front: Rgb, back: Rgb, alpha: number): Rgb => front.map((channel, index) => Math.round(channel * alpha + back[index]! * (1 - alpha))) as unknown as Rgb;

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

const quarters = " ▗▖▄▝▐▞▟▘▚▌▙▀▜▛█";

const plugins = [
    { glyph: "K", name: "Kanban", hue: "moss" },
    { glyph: "B", name: "Build", hue: "clay" },
    { glyph: "R", name: "Runs", hue: "sky" },
    { glyph: "D", name: "Docs", hue: "sun" },
    { glyph: "A", name: "Agents", hue: "nebula" },
    { glyph: "$", name: "Shell", hue: "tide" },
] as const;

const commands = [
    { plugin: 0, label: "New card", keys: "N" },
    { plugin: 1, label: "Publish the library", keys: "P" },
    { plugin: 2, label: "Run round", keys: "R" },
    { plugin: 5, label: "Open a shell here", keys: "S" },
] as const;

const cards = [
    { id: 14, title: "Add the Apex review skill", phase: "READY", age: "2h ago" },
    { id: 13, title: "Wire the Quote callout retries", phase: "RUNNING", age: "36m ago" },
    { id: 11, title: "Document the Record Type matrix", phase: "REVIEW", age: "3d ago" },
    { id: 9, title: "Split the trigger handler by context", phase: "DONE", age: "12d ago" },
];

const pad2 = (value: number) => String(value).padStart(2, "0");

export class SynScreen {
    private cells: Cell[][] = [];
    private input = "";
    private answer = "";
    private palette = false;
    private chosen = 0;
    private frame = 0;

    constructor(
        private cols: number,
        private rows: number,
        private colors: Palette,
        private readonly mode: () => "stars" | "contours",
        private readonly project: string,
    ) {}

    resize(cols: number, rows: number) {
        this.cols = cols;
        this.rows = rows;
    }

    repaint(colors: Palette) {
        this.colors = colors;
    }

    tick() {
        this.frame++;
    }

    /* Keys as xterm hands them over: printable text, Enter, Backspace, Escape and the arrows. */
    key(data: string) {
        if (this.palette) {
            if (data === "\u001b") this.palette = false;
            else if (data === "\u001b[A") this.chosen = (this.chosen + commands.length - 1) % commands.length;
            else if (data === "\u001b[B") this.chosen = (this.chosen + 1) % commands.length;
            else if (data === "\r") {
                this.answer = `${commands[this.chosen]!.label}: syn is a mock, nothing ran`;
                this.palette = false;
            }
            return;
        }
        if (data === "/" && !this.input) this.palette = true;
        else if (data === "\r") {
            this.answer = this.input.trim() ? `syn is a mock, nothing ran: ${this.input.trim()}` : "";
            this.input = "";
        } else if (data === "\u007f") this.input = this.input.slice(0, -1);
        else if (data === "\u001b") this.input = "";
        else if (!data.startsWith("\u001b") && data >= " ") this.input += data;
    }

    private put(row: number, col: number, text: string, fg?: Rgb, bg?: Rgb) {
        if (row < 0 || row >= this.rows) return;
        [...text].forEach((ch, index) => {
            const at = col + index;
            if (at >= 0 && at < this.cols) this.cells[row]![at] = { ch, fg, bg };
        });
    }

    private fill(row: number, col: number, width: number, height: number, bg: Rgb) {
        for (let y = row; y < row + height; y++) this.put(y, col, " ".repeat(Math.max(0, width)), undefined, bg);
    }

    private clip(text: string, width: number) {
        return text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text.padEnd(width);
    }

    render(): string {
        const c = this.colors;
        this.cells = Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, () => ({ ch: " " })));
        const left = 2;
        const right = this.cols - 2;
        const now = new Date();

        this.put(1, left, "SYN", c["ink-muted"]);
        this.put(1, left + 5, this.project, c.ink);
        const stamp = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
        this.put(1, right - stamp.length, stamp, c["ink-muted"]);

        this.put(3, left, "PLUGINS", c["ink-muted"]);
        plugins.forEach((plugin, index) => {
            const x = left + index * 9;
            const tint = c[`${plugin.hue}-tile`];
            this.fill(4, x + 1, 5, 3, tint);
            this.put(5, x + 3, plugin.glyph, c[plugin.hue], tint);
            const name = this.clip(plugin.name, 7).trimEnd();
            this.put(7, x + Math.floor((7 - name.length) / 2), name, c.ink);
        });
        const tilesEnd = left + plugins.length * 9;

        const table = 9;
        const width = Math.min(right - left, 72);
        const columns = [
            { label: "ID", at: 0 },
            { label: "TITLE", at: 6 },
            { label: "PHASE", at: width - 20 },
            { label: "AGE", at: width - 9 },
        ];
        this.put(table, left, "CARDS", c["ink-muted"]);
        this.put(table + 1, left, "▲ 12,5 %", c.up);
        this.put(table + 1, left + 10, "more cards done than last week", c["ink-muted"]);
        for (const column of columns) this.put(table + 3, left + column.at, column.label, c["ink-muted"]);
        this.put(table + 4, left, "─".repeat(width), c.hairline);
        cards.forEach((card, index) => {
            const row = table + 5 + index;
            this.put(row, left, `#${card.id}`, c["ink-muted"]);
            this.put(row, left + 6, this.clip(card.title, width - 28), c.ink);
            this.put(row, left + width - 20, card.phase, c["ink-muted"]);
            this.put(row, left + width - 9, card.age, c["ink-muted"]);
        });

        this.spectacle(Math.max(tilesEnd + 4, left + width + 4), 3, right, this.rows - 5);

        const prompt = this.rows - 3;
        this.put(prompt, left, "›", c["ink-muted"]);
        this.put(prompt, left + 2, this.input, c.ink);
        this.put(prompt, left + 2 + this.input.length, this.frame % 8 < 4 || this.palette ? "▏" : " ", c.ink);
        if (!this.input) this.put(prompt, left + 3, "Ask syn, or / for commands", c["ink-faint"]);
        if (this.answer) this.put(prompt + 1, left + 2, this.clip(this.answer, right - left - 2), c["ink-muted"]);

        if (this.palette) this.floating();
        return this.serialize();
    }

    /* Space: stars in quarter blocks at several intensities that twinkle and drift. Earth: contour lines. */
    private spectacle(x0: number, y0: number, x1: number, y1: number) {
        const c = this.colors;
        if (x1 - x0 < 8 || y1 - y0 < 3) return;
        if (this.mode() === "stars") {
            const drift = this.frame / 40;
            for (let y = y0; y < y1; y++)
                for (let x = x0; x < x1; x++) {
                    const seed = hash(Math.floor(x + drift) * 3.1, y * 7.7);
                    if (seed > 0.025) continue;
                    const twinkle = 0.55 + 0.45 * Math.sin(this.frame / 6 + seed * 400);
                    const glyph = quarters[[1, 2, 4, 8][Math.floor(seed * 1000) % 4]!]!;
                    this.put(y, x, glyph, mix(c.ink, c.ground, 0.25 + 0.7 * twinkle * (seed / 0.025)));
                }
            return;
        }
        const t = this.frame / 60;
        for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
                const sample = (dx: number, dy: number) => noise((x + dx) / 28 + t * 0.05, (y + dy) / 14 + t * 0.02) * 0.65 + noise((x + dx) / 14 - t * 0.03, (y + dy) / 7 + 3.7) * 0.35;
                const values = [sample(0, 0), sample(0.5, 0), sample(0, 0.5), sample(0.5, 0.5)];
                for (let level = 1; level < 6; level++) {
                    const iso = level / 6;
                    const bits = (values[0]! > iso ? 8 : 0) | (values[1]! > iso ? 4 : 0) | (values[2]! > iso ? 2 : 0) | (values[3]! > iso ? 1 : 0);
                    if (bits === 0 || bits === 15) continue;
                    this.put(y, x, quarters[bits]!, level === 3 ? c.moss : c["ink-faint"]);
                    break;
                }
            }
    }

    /* The palette floats: a veil repaints the screen in ink-faint, the box sits on ground-raised with its light edge. */
    private floating() {
        const c = this.colors;
        for (const row of this.cells) for (const cell of row) if (cell.fg) cell.fg = c["ink-faint"];
        const width = Math.min(56, this.cols - 8);
        const height = commands.length + 7;
        const x = Math.floor((this.cols - width) / 2);
        const y = 4;
        const raised = c["ground-raised"];
        this.fill(y, x, width, height, raised);
        this.put(y, x, `╭${"─".repeat(width - 2)}╮`, c["ink-faint"], raised);
        for (let row = y + 1; row < y + height - 1; row++) {
            this.put(row, x, "│", c.hairline, raised);
            this.put(row, x + width - 1, "│", c.hairline, raised);
        }
        this.put(y + height - 1, x, `╰${"─".repeat(width - 2)}╯`, c.hairline, raised);
        this.put(y + 1, x + 2, "›", c["ink-muted"], raised);
        this.put(y + 1, x + 4, "Type a command", c["ink-muted"], raised);
        this.put(y + 2, x, `├${"─".repeat(width - 2)}┤`, c.hairline, raised);
        commands.forEach((command, index) => {
            const row = y + 3 + index;
            const plugin = plugins[command.plugin]!;
            const back = index === this.chosen ? c["ground-hover"] : raised;
            this.fill(row, x + 1, width - 2, 1, back);
            this.put(row, x + 2, plugin.glyph, c[plugin.hue], back);
            this.put(row, x + 4, command.label, c.ink, back);
            this.put(row, x + width - 3, command.keys, c["ink-muted"], back);
        });
        const buttons = y + height - 2;
        const run = " Run round ";
        this.put(buttons, x + width - 2 - run.length, run, c["on-primary"], c["primary-fill"]);
        this.put(buttons, x + width - 4 - run.length - 6, "Cancel", c["ink-muted"], raised);
    }

    private serialize(): string {
        const sgr = (fg?: Rgb, bg?: Rgb) => `\u001b[0;${fg ? `38;2;${fg.join(";")}` : "39"};${bg ? `48;2;${bg.join(";")}` : "49"}m`;
        let out = "\u001b[?25l\u001b[H";
        this.cells.forEach((row, index) => {
            let last = "";
            for (const cell of row) {
                const code = sgr(cell.fg, cell.bg);
                if (code !== last) out += code;
                last = code;
                out += cell.ch;
            }
            out += "\u001b[0m";
            if (index < this.rows - 1) out += "\r\n";
        });
        return out;
    }
}
