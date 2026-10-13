import { type ReactNode, useState } from "react";
import { Status, type Tone } from "./primitives.tsx";

export interface TableColumn {
    key: string;
    label: string;
    numeric?: boolean;
}

export function DataTable({ title, columns, rows }: { title?: string; columns: readonly TableColumn[]; rows: readonly Record<string, ReactNode>[] }) {
    return (
        <div className="aspis-table">
            {title && <div className="aspis-table__title">{title}</div>}
            <div className="aspis-table__scroll">
                <table>
                    <thead>
                        <tr>
                            {columns.map((column) => (
                                <th key={column.key} className="aspis-table__head" data-numeric={column.numeric || undefined}>
                                    {column.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={index} className="aspis-table__row">
                                {columns.map((column) => (
                                    <td key={column.key} className="aspis-table__cell" data-numeric={column.numeric || undefined}>
                                        {row[column.key]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function List({ label, children }: { label: string; children: ReactNode }) {
    return (
        <ul className="aspis-list" aria-label={label}>
            {children}
        </ul>
    );
}

export function ListRow({
    lead,
    title,
    meta,
    trail,
    active,
    onSelect,
}: {
    lead?: ReactNode;
    title: ReactNode;
    meta?: readonly ReactNode[];
    trail?: ReactNode;
    active?: boolean;
    onSelect?: () => void;
}) {
    return (
        <li className="aspis-list__item">
            <button type="button" className="aspis-row" aria-current={active || undefined} onClick={onSelect}>
                <span className="aspis-row__lead">{lead}</span>
                <span className="aspis-row__main">
                    <span className="aspis-row__title">{title}</span>
                    {meta && meta.length > 0 && (
                        <span className="aspis-row__meta">
                            {meta.map((item, index) => (
                                <span key={index}>{item}</span>
                            ))}
                        </span>
                    )}
                </span>
                <span className="aspis-row__trail">{trail}</span>
            </button>
        </li>
    );
}

export type TokenKind = "" | "keyword" | "function" | "literal" | "argument" | "comment";

export interface CodeLine {
    segments?: readonly (readonly [TokenKind, string])[];
    text?: string;
    diff?: "add" | "del";
}

const lineText = (line: CodeLine) => line.text ?? line.segments?.map(([, text]) => text).join("") ?? "";

export function CodeBlock({ title, lang, lines }: { title: string; lang?: string; lines: readonly CodeLine[] }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        await navigator.clipboard.writeText(lines.map(lineText).join("\n"));
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
    };
    return (
        <figure className="aspis-code">
            <figcaption className="aspis-code__head">
                <span className="aspis-code__title">{title}</span>
                {lang && <span className="aspis-code__lang">{lang}</span>}
                <button type="button" className="aspis-code__copy" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                </button>
            </figcaption>
            <pre className="aspis-code__body">
                <code>
                    {lines.map((line, index) => (
                        <span key={index} className="aspis-code__line" data-diff={line.diff}>
                            {line.segments
                                ? line.segments.map(([kind, text], at) => (
                                      <span key={at} className="aspis-code__token" data-kind={kind || undefined}>
                                          {text}
                                      </span>
                                  ))
                                : line.text}
                            {"\n"}
                        </span>
                    ))}
                </code>
            </pre>
        </figure>
    );
}

export type LogKind = "prompt" | "answer" | "tool" | "dim" | "add" | "del" | "gap";

export interface LogLine {
    kind: LogKind;
    text?: string;
}

const gutters: Record<LogKind, string> = { prompt: ">", answer: "", tool: "●", dim: "", add: "+", del: "-", gap: "" };

export function LiveLog({
    title,
    lines,
    status,
    tone = "ok",
    streaming,
}: {
    title: string;
    lines: readonly LogLine[];
    status?: string;
    tone?: Tone;
    streaming?: boolean;
}) {
    return (
        <section className="aspis-log">
            <header className="aspis-log__bar">
                <span className="aspis-log__lights" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                </span>
                <span className="aspis-log__title">{title}</span>
                {status && <Status tone={tone}>{status}</Status>}
            </header>
            <div className="aspis-log__screen" role="log" aria-live="polite">
                <div className="aspis-log__lines">
                    {lines.map((line, index) => (
                        <div key={index} className="aspis-log__line" data-kind={line.kind}>
                            <span className="aspis-log__gutter">{gutters[line.kind]}</span>
                            <span className="aspis-log__text">{line.text}</span>
                        </div>
                    ))}
                    {streaming && (
                        <div className="aspis-log__line" data-kind="answer">
                            <span className="aspis-log__gutter" />
                            <span className="aspis-log__caret" />
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
