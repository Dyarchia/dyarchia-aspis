import { Page } from "@dyarchia/aspis";

export function Home() {
    return (
        <Page title="Home">
            <div className="grid flex-1 place-items-center p-[var(--aspis-gutter)]">
                <p className="m-0 text-[var(--aspis-ink-1)] [font:var(--aspis-type-display)] tracking-[var(--aspis-tracking-display)]">Dyarchia Aspis</p>
            </div>
        </Page>
    );
}
