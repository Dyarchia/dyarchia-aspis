import { EmptyState, Page, PageHeader } from "@dyarchia/aspis";

export function Pending({ title, explanation, sprint, text }: { title: string; explanation: string; sprint: string; text: string }) {
    return (
        <Page head={<PageHeader title={title} explanation={explanation} />}>
            <EmptyState icon="clock" title={`Arrives in ${sprint}`} text={text} />
        </Page>
    );
}
