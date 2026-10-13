import {
    Bars,
    Board,
    Button,
    Chip,
    CodeBlock,
    Column,
    type CodeLine,
    CommandPalette,
    DataTable,
    Dialog,
    Divider,
    EmptyState,
    Icon,
    Kbd,
    List,
    ListRow,
    LiveLog,
    Mark,
    type LogLine,
    MetaTree,
    Page,
    PageHeader,
    Panel,
    Section,
    Select,
    StatGrid,
    Status,
    Switch,
    Tabs,
    TextArea,
    TextField,
    Thread,
    Tile,
    iconNames,
    themeCatalog,
    useToast,
} from "@dyarchia/aspis";
import { Theme } from "@dyarchia/core";
import { useEffect, useState } from "react";


const code: CodeLine[] = [
    { segments: [["keyword", "export function "], ["function", "moveCard"], ["", "("], ["argument", "card"], ["", ", "], ["argument", "phase"], ["", ") {"]] },
    { segments: [["comment", "    // Every client reads the same row on its next poll"]] },
    { diff: "del", text: "    store.update(card.id, { phase })" },
    { diff: "add", text: "    store.transaction(() => store.move(card.id, phase))()" },
    { segments: [["", "    "], ["keyword", "return "], ["literal", "true"]] },
    { text: "}" },
];

const script: LogLine[] = [
    { kind: "prompt", text: "Review the open cards and move the finished ones to Review" },
    { kind: "gap" },
    { kind: "tool", text: "Read(state.db cards where phase = Running)" },
    { kind: "dim", text: "  └ 3 cards, 1 with a passing check" },
    { kind: "answer", text: "One card has finished its work. Moving it now." },
    { kind: "tool", text: "Update(card 42)" },
    { kind: "del", text: "  phase: Running" },
    { kind: "add", text: "  phase: Review" },
    { kind: "answer", text: "Done. Card 42 is in Review; the other two are still running." },
];

export function Gallery({ theme, onTheme }: { theme: Theme; onTheme: (theme: Theme) => void }) {
    const toast = useToast();
    const [tab, setTab] = useState<"all" | "mine" | "done">("all");
    const [notify, setNotify] = useState(true);
    const [phase, setPhase] = useState("triage");
    const [palette, setPalette] = useState(false);
    const [shown, setShown] = useState(3);
    const [drawer, setDrawer] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => setShown((count) => (count >= script.length ? 3 : count + 1)), 1400);
        return () => clearInterval(timer);
    }, []);

    return (
        <Page
            head={
                <PageHeader
                    title="Aspis"
                    explanation="One vocabulary, two themes."
                    lead="Every component of the app on the same markup. The theme only decides its design."
                    actions={
                        <Tabs
                            label="Theme"
                            tabs={(Object.keys(themeCatalog) as Theme[]).map((id) => ({ id, label: themeCatalog[id].label }))}
                            value={theme}
                            onChange={onTheme}
                        />
                    }
                />
            }
        >
            <Section label="Actions">
                <div className="flex flex-wrap items-center gap-[var(--aspis-space-4)]">
                    <Button variant="primary">Run card</Button>
                    <Button variant="primary" icon="bolt" hotkey="R">
                        Run now
                    </Button>
                    <Button variant="secondary">Schedule</Button>
                    <Button variant="secondary" icon="plus">
                        New card
                    </Button>
                    <Button variant="quiet">View history</Button>
                    <Button variant="primary" disabled>
                        Disabled
                    </Button>
                </div>
                <Tabs
                    label="Filter"
                    tabs={[
                        { id: "all", label: "All", count: 24 },
                        { id: "mine", label: "Mine", count: 6 },
                        { id: "done", label: "Done", count: 11 },
                    ]}
                    value={tab}
                    onChange={setTab}
                />
            </Section>

            <Section label="Signals">
                <div className="flex flex-wrap items-center gap-[var(--aspis-space-5)]">
                    <Status tone="ok">Live</Status>
                    <Status tone="warn">Waiting</Status>
                    <Status tone="danger">Blocked</Status>
                    <Status tone="info">Scheduled</Status>
                    <Status tone="idle">Idle</Status>
                </div>
                <div className="flex flex-wrap items-center gap-[var(--aspis-space-3)]">
                    <Chip>claude-opus</Chip>
                    <Chip tone="ok">Done</Chip>
                    <Chip tone="warn">Review</Chip>
                    <Chip tone="danger">Failed</Chip>
                    <Chip tone="info">Cron 08:30</Chip>
                    <Kbd>H</Kbd>
                    <Kbd>Ctrl K</Kbd>
                </div>
            </Section>

            <Section label="Forms">
                <div className="grid grid-cols-2 gap-[var(--aspis-space-6)]">
                    <TextField label="Card title" placeholder="Describe the work" hint="Shown on the board and in every client" />
                    <Select
                        label="Phase"
                        value={phase}
                        onChange={(event) => setPhase(event.target.value)}
                        options={[
                            { value: "triage", label: "Triage" },
                            { value: "scheduled", label: "Scheduled" },
                            { value: "ready", label: "Ready" },
                            { value: "review", label: "Review" },
                        ]}
                    />
                </div>
                <Switch checked={notify} onChange={setNotify} label="Notify when the run finishes" />
            </Section>

            <Section label="Surfaces">
                <div className="grid grid-cols-2 gap-[var(--aspis-space-5)]">
                    <Panel title="Card 42" meta="Running" actions={<Button variant="quiet">Open</Button>}>
                        <MetaTree
                            items={[
                                { term: "Agent", values: ["claude-opus-5-5"] },
                                { term: "Worktree", values: ["~/.dyarchia-aspis/worktrees/42"] },
                            ]}
                        />
                    </Panel>
                    <Panel title="Today">
                        <StatGrid
                            stats={[
                                { label: "Runs", value: "18" },
                                { label: "Blocked", value: "2" },
                            ]}
                        />
                    </Panel>
                </div>
                <StatGrid
                    stats={[
                        { label: "Cards", value: "128" },
                        { label: "Running", value: "3" },
                        { label: "Review", value: "7" },
                        { label: "Spent today", value: "$4.20" },
                    ]}
                />
                <Divider />
                <EmptyState icon="inbox" title="Nothing in Review" text="Cards land here when an agent finishes its work." action={<Button variant="secondary">New card</Button>} />
            </Section>

            <Section label="Data">
                <DataTable
                    title="Recent runs"
                    columns={[
                        { key: "card", label: "Card" },
                        { key: "agent", label: "Agent" },
                        { key: "status", label: "Status" },
                        { key: "duration", label: "Duration", numeric: true },
                    ]}
                    rows={[
                        { card: "Refactor trigger handler", agent: "claude", status: <Status tone="ok">Done</Status>, duration: "6 min" },
                        { card: "Write callout tests", agent: "kimi", status: <Status tone="info">Running</Status>, duration: "12:40" },
                        { card: "Fix flow fault path", agent: "claude", status: <Status tone="danger">Blocked</Status>, duration: "2 min" },
                    ]}
                />
                <Bars
                    title="Runs by agent"
                    unit="this week"
                    bars={[
                        { label: "claude-opus", value: 42 },
                        { label: "kimi-code", value: 17 },
                        { label: "codex", value: 9 },
                    ]}
                />
                <List label="Cards">
                    <ListRow lead="Oct 12" title="Move the pricing rules to a selector class" meta={["Review", "claude"]} trail="6 min" />
                    <ListRow lead="Oct 11" title="Cover the callout retry path with HttpMocks" meta={["Running", "kimi"]} trail="12:40" active />
                    <ListRow lead="Oct 09" title="Archive the stale Quote record types" meta={["Done", "claude"]} trail="2 min" />
                </List>
            </Section>

            <Section label="Terminal">
                <CodeBlock title="card.ts" lang="typescript" lines={code} />
                <div className="h-[360px]">
                    <LiveLog title="card 42 · claude-opus-5-5" status="Running" tone="info" lines={script.slice(0, shown)} streaming />
                </div>
            </Section>

            <Section label="Kanban">
                <div className="h-[300px]">
                    <Board label="Sample board">
                        <Column title="Ready" count={1}>
                            <Tile reference="#4" title="Cover the callout retry path" meta={["P1", "claude-code", "ivirma-crm"]} onOpen={() => setDrawer(true)} />
                        </Column>
                        <Column title="Blocked" count={1} drop="refused">
                            <Tile reference="#6" title="Fix the flow fault path" note="Which org has the failing flow?" meta={["claude-code"]} onOpen={() => setDrawer(true)} />
                        </Column>
                        <Column title="Review" count={1} drop="allowed">
                            <Tile
                                reference="#7"
                                title="Archive stale Quote fields"
                                active
                                meta={["codex"]}
                                marks={
                                    <>
                                        <Mark ok label="Auditor" />
                                        <Mark ok={null} label="You" />
                                    </>
                                }
                                onOpen={() => setDrawer(true)}
                            />
                        </Column>
                    </Board>
                </div>
                <Thread
                    entries={[
                        { id: 1, who: "You", when: "Oct 13 09:02", kind: "note", text: "Use the UAT sandbox for the mocks" },
                        { id: 2, who: "Agent", when: "Oct 13 09:40", kind: "moved", text: "Running → Review\nRemoved 14 fields, tests green" },
                        { id: 3, who: "Auditor", when: "Oct 13 09:44", kind: "verdict", text: "✓ Diff matches the brief" },
                    ]}
                />
                <Button variant="secondary" onClick={() => setDrawer(true)}>
                    Open card panel
                </Button>
                <Dialog open={drawer} onClose={() => setDrawer(false)} title="#7 Archive stale Quote fields" footer={<Button variant="primary" onClick={() => setDrawer(false)}>Done</Button>}>
                    <TextArea label="Brief" defaultValue="Remove fields unused for twelve months" />
                </Dialog>
            </Section>

            <Section label="Overlays">
                <div className="flex flex-wrap items-center gap-[var(--aspis-space-4)]">
                    <Button variant="secondary" icon="search" onClick={() => setPalette(true)}>
                        Open palette
                    </Button>
                    <Button variant="secondary" onClick={() => toast({ text: "Card 42 moved to Review", tone: "ok" })}>
                        Toast
                    </Button>
                    <Button variant="secondary" onClick={() => toast({ text: "Card 17 is blocked", tone: "danger" })}>
                        Error toast
                    </Button>
                </div>
                <CommandPalette
                    open={palette}
                    onClose={() => setPalette(false)}
                    commands={[
                        { id: "new", label: "New card", hint: "Create in Triage", hotkey: "N", run: () => toast({ text: "New card" }) },
                        { id: "run", label: "Run card", hint: "Start the selected card", hotkey: "R", run: () => toast({ text: "Run" }) },
                        { id: "stop", label: "Stop card", hint: "Every client stops it", run: () => toast({ text: "Stop", tone: "warn" }) },
                    ]}
                />
            </Section>

            <Section label="Icons" count={iconNames.length}>
                <div className="grid grid-cols-6 gap-[var(--aspis-space-4)]">
                    {iconNames.map((name) => (
                        <div key={name} className="flex items-center gap-[var(--aspis-space-2)]">
                            <Icon name={name} />
                            <Chip>{name}</Chip>
                        </div>
                    ))}
                </div>
            </Section>
        </Page>
    );
}
