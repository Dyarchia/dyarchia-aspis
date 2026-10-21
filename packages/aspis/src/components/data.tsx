import { type ReactNode, useState } from "react";
import { Status, type Tone } from "./primitives.tsx";

export type TokenKind = "" | "keyword" | "function" | "literal" | "argument" | "comment";

export interface CodeLine {
    segments?: readonly (readonly [TokenKind, string])[];
    text?: string;
    diff?: "add" | "del";
}

const lineText = (line: CodeLine) => line.text ?? line.segments?.map(([, text]) => text).join("") ?? "";

export function CodeBlock({ title, lang, lines, wrap }: { title: string; lang?: string; lines: readonly CodeLine[]; wrap?: boolean }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        await navigator.clipboard.writeText(lines.map(lineText).join("\n"));
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
    };
    return (
        <figure className="aspis-code" data-wrap={wrap || undefined}>
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
                <span className="aspis-log__title">{title}</span>
                {status && <Status tone={tone}>{status}</Status>}
            </header>
            <div className="aspis-log__screen" role="log" aria-live={streaming ? "off" : "polite"} aria-label={title} tabIndex={0}>
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
