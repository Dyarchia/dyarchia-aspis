import { type KindId, kindIds, pieceAt } from "@dyarchia/library";
import type { Library } from "../../use-library.ts";

export interface Selection {
    kind: KindId;
    name: string;
}

export const nameRule = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

export function piecesOf(files: readonly string[]): Map<KindId, string[]> {
    const found = new Map<KindId, Set<string>>(kindIds.map((id) => [id, new Set<string>()]));
    for (const path of files) {
        const at = pieceAt(path);
        if (at) found.get(at.kind)!.add(at.name);
    }
    return new Map([...found].map(([kind, names]) => [kind, [...names].sort()]));
}

export function unpublished(library: Library): Set<string> {
    return new Set(
        (library.status?.changes ?? [])
            .map((change) => pieceAt(change.path))
            .filter((at) => at !== undefined)
            .map((at) => `${at.kind}/${at.name}`),
    );
}
