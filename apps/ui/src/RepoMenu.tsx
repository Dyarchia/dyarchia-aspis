import { MenuItem, MenuNote, MenuSearch } from "@dyarchia/aspis";
import { useEffect, useRef, useState } from "react";
import type { Library, RepoList } from "./use-library.ts";

const fullName = /^[\w.-]+\/[\w.-]+$/;
const bareName = /^[\w.-]+$/;

/*
 * The library is chosen here and nowhere else: the repositories the GitHub CLI can see, filtered as you type, the
 * one in use checked, and None to work without one. New repository is always there, with or without repositories to
 * list and even when the listing fails: it asks for a name, under the signed-in login unless an owner is written,
 * and creates it private. Typing a name that is not listed offers the same. The list is fetched each time the menu
 * opens, so a repository made elsewhere shows up without a restart.
 */
export function RepoMenu({ library, opened }: { library: Library; opened: number }) {
    const [list, setList] = useState<RepoList>();
    const [error, setError] = useState<string>();
    const [query, setQuery] = useState("");
    const [creating, setCreating] = useState(false);
    const input = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!opened) return;
        setError(undefined);
        setCreating(false);
        library
            .repos()
            .then((next) => (setList(next), setError(next.error ?? undefined)))
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
    }, [opened]);

    const close = () => document.getElementById("shell-menu")?.hidePopover();
    const choose = (repo: string | null) => {
        close();
        setQuery("");
        setCreating(false);
        if (library.loaded && repo === (library.repo ?? null)) return;
        void (repo ? library.connect(repo) : library.disconnect());
    };
    const startCreating = () => {
        setCreating(true);
        setQuery(list?.login ? `${list.login}/` : "");
        input.current?.focus();
    };
    const stopCreating = () => {
        setCreating(false);
        setQuery("");
        input.current?.focus();
    };

    const typed = query.trim();
    const target = fullName.test(typed) ? typed : bareName.test(typed) && list?.login ? `${list.login}/${typed}` : undefined;
    const repos = list?.repos ?? [];
    const needle = typed.toLowerCase();
    const shown = creating ? [] : repos.filter((repo) => repo.toLowerCase().includes(needle));
    const taken = repos.find((repo) => repo.toLowerCase() === target?.toLowerCase());
    const creatable = target && !taken ? target : undefined;
    const enter = () => {
        const pick = creating ? (creatable ?? taken) : (shown[0] ?? creatable);
        if (pick) choose(pick);
    };

    return (
        <>
            <MenuSearch
                ref={input}
                label={creating ? "Name of the new repository" : "Find a repository"}
                placeholder={creating ? "owner/name" : undefined}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && enter()}
            />
            <div className="aspis-menu__list">
                {!creating && error && <MenuNote>{error}</MenuNote>}
                {!creating && !error && !list && <MenuNote>Loading repositories</MenuNote>}
                {shown.map((repo) => (
                    <MenuItem key={repo} icon="repo" current={repo === library.repo} onClick={() => choose(repo)}>
                        {repo}
                    </MenuItem>
                ))}
                {creatable && (
                    <MenuItem icon="plus" onClick={() => choose(creatable)}>
                        Create {creatable}
                    </MenuItem>
                )}
                {creating && taken && (
                    <MenuItem icon="repo" current={taken === library.repo} onClick={() => choose(taken)}>
                        {taken}
                    </MenuItem>
                )}
                {creating && !creatable && !taken && <MenuNote>{list?.login ? "Private, on GitHub. Write owner/name for an organization" : "Write it as owner/name"}</MenuNote>}
                {!creating && list && !error && repos.length === 0 && !creatable && <MenuNote>No repositories yet</MenuNote>}
                {!creating && list && repos.length > 0 && shown.length === 0 && !creatable && <MenuNote>No repository matches</MenuNote>}
            </div>
            <div className="aspis-menu__list">
                {creating ? (
                    <MenuItem icon="repo" onClick={stopCreating}>
                        Your repositories
                    </MenuItem>
                ) : (
                    <MenuItem icon="plus" onClick={startCreating}>
                        New repository
                    </MenuItem>
                )}
                <MenuItem icon="close" current={!library.repo} onClick={() => choose(null)}>
                    None
                </MenuItem>
            </div>
        </>
    );
}
