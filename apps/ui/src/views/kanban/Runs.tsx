import { CodeBlock, LiveLog, TabPanel, Tabs, type Tone } from "@dyarchia/aspis";
import { type Card, type Run, type RunStatus, resumeCommands, runLines } from "@dyarchia/core";
import { useEffect, useMemo, useState } from "react";
import type { BoardApi } from "./use-board.ts";

const kindLabels: Record<Run["kind"], string> = { headless: "Run", interactive: "Session", audit: "Audit" };

const statusLabels: Record<RunStatus, [string, Tone]> = {
    running: ["Running", "info"],
    done: ["Done", "ok"],
    failed: ["Failed", "danger"],
    stopped: ["Stopped", "warn"],
    blocked: ["Asked you", "warn"],
};

const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function status(run: Run): [string, Tone] {
    if (run.status === "running" && !run.live) return ["Not answering", "idle"];
    return statusLabels[run.status];
}

/*
 * The attempts of a card and the log of the selected one. A live log is read from where the last read stopped,
 * a few times per second, so the answer appears as the harness writes it; a finished log is read once.
 */
export function RunHistory({ card, board, changes, empty }: { card: Card; board: BoardApi; changes: number; empty: string }) {
    const cardId = card.id;
    const [runs, setRuns] = useState<Run[]>([]);
    const [selected, setSelected] = useState<string>();
    const [text, setText] = useState("");

    useEffect(() => {
        let stale = false;
        void board.run(() => board.runs(cardId)).then((next) => !stale && next && setRuns(next));
        return () => {
            stale = true;
        };
    }, [cardId, changes]);

    const run = runs.find((candidate) => String(candidate.id) === selected) ?? runs[0];
    const live = run?.live ?? false;

    useEffect(() => {
        setText("");
        if (!run) return;
        let stale = false;
        let from = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const read = async () => {
            const chunk = await board.run(() => board.log(cardId, run.id, from));
            if (stale || !chunk) return;
            from = chunk.next;
            if (chunk.text) setText((current) => current + chunk.text);
            if (chunk.live) timer = setTimeout(read, 400);
        };
        void read();
        return () => {
            stale = true;
            clearTimeout(timer);
        };
    }, [cardId, run?.id, live]);

    const lines = useMemo(() => runLines(text), [text]);
    if (!run) return <span className="aspis-field__hint">{empty}</span>;
    const [label, tone] = status(run);

    return (
        <div className="flex flex-col gap-[var(--aspis-space-3)]">
            {runs.length > 1 && (
                <Tabs
                    label="Attempts"
                    id={`attempts-${card.id}`}
                    value={String(run.id)}
                    onChange={setSelected}
                    tabs={[...runs].reverse().map((candidate) => ({ id: String(candidate.id), label: `${kindLabels[candidate.kind]} ${candidate.attempt} · ${clock(candidate.startedAt)}` }))}
                />
            )}
            <TabPanel id={`attempts-${card.id}`} value={String(run.id)} className="h-[340px]">
                <LiveLog title={run.branch} status={label} tone={tone} lines={lines} streaming={live} />
            </TabPanel>
            {run.error && <span className="aspis-field__hint">{run.error}</span>}
            {run.sessionId && run.kind !== "interactive" && (
                <CodeBlock
                    title={`${kindLabels[run.kind]} ${run.attempt} session`}
                    lang={(run.kind === "audit" ? card.auditor.harness : card.implementer.harness) ?? undefined}
                    lines={[
                        { text: `cd "${card.folder}"` },
                        { text: resumeCommands[(run.kind === "audit" ? card.auditor.harness : card.implementer.harness) ?? ""]?.(run.sessionId) ?? run.sessionId },
                    ]}
                />
            )}
        </div>
    );
}
