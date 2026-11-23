import { MenuItem, MenuNote, MenuSearch } from "@dyarchia/aspis";
import { useEffect, useState } from "react";
import type { Library } from "./use-library.ts";

const fullName = /^[\w.-]+\/[\w.-]+$/;

/*
 * The library is chosen here and nowhere else: the repositories the GitHub CLI can see, filtered as you type, the
 * one in use checked, and None to work without one. Typing owner/name that is not listed offers to create it,
 * private. The list is fetched each time the menu opens, so a repository made elsewhere shows up without a restart.
 */
export function RepoMenu({ library, opened }: { library: Library; opened: number }) {
    const [repos, setRepos] = useState<string[]>();
    const [error, setError] = useState<string>();
    const [query, setQuery] = useState("");

    useEffect(() => {
        if (!opened) return;
        setQuery("");
        setError(undefined);
        library
            .repos()
            .then(setRepos)
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
    }, [opened]);

    const close = () => document.getElementById("aspis-brand-menu")?.hidePopover();
    const choose = (repo: string | null) => {
        close();
        if (repo === (library.repo ?? null)) return;
        void (repo ? library.connect(repo) : library.disconnect());
    };
    const needle = query.trim().toLowerCase();
    const shown = (repos ?? []).filter((repo) => repo.toLowerCase().includes(needle));
    const creatable = fullName.test(query.trim()) && !repos?.some((repo) => repo.toLowerCase() === needle);

    return (
        <>
            <MenuSearch
                label="Find a repository"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    const pick = shown[0] ?? (creatable ? query.trim() : undefined);
                    if (pick) choose(pick);
                }}
            />
            <div className="aspis-menu__list">
                {error && <MenuNote>{error}</MenuNote>}
                {!error && !repos && <MenuNote>Loading repositories</MenuNote>}
                {shown.map((repo) => (
                    <MenuItem key={repo} icon="repo" current={repo === library.repo} onClick={() => choose(repo)}>
                        {repo}
                    </MenuItem>
                ))}
                {creatable && (
                    <MenuItem icon="plus" onClick={() => choose(query.trim())}>
                        Create {query.trim()}
                    </MenuItem>
                )}
                {repos && shown.length === 0 && !creatable && <MenuNote>No repository matches</MenuNote>}
            </div>
            <div className="aspis-menu__list">
                <MenuItem icon="close" current={!library.repo} onClick={() => choose(null)}>
                    None
                </MenuItem>
            </div>
        </>
    );
}
