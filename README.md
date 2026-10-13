# Dyarchia Aspis

The Dyarchia desktop app: Build and Kanban over a single local source of truth.

**Alpha. Not a release.** Every sprint ships a prerelease installer under GitHub Releases. The installer is
unsigned, so Windows SmartScreen warns about an unknown publisher. It installs for the current user, without
elevation, and keeps its state in `~/.dyarchia-aspis/state.db`.

The app updates itself: it looks for the newest release on GitHub (prereleases included), checks its signed
`latest.json` and, on confirmation from Settings or the command palette, installs it and restarts.

## Kanban

Eight fixed phases: Triage, Scheduled, Ready, Running, Blocked, Review, Done and Archived. The rules (who may
move a card, from where to where and under which condition) live in one pure function in `packages/core`, and
the store only moves cards through it. Scheduled cards run headless and archive themselves; Ready cards are
picked up interactively and end in Review, where an auditor and then you must both approve before Done.

## Stack

- Tauri 2 shell with a Bun-compiled Hono sidecar (`aspis-server`)
- React, Vite and Tailwind v4 for the views
- SQLite (`bun:sqlite`, WAL) as the shared source of truth
- Aspis design system with two themes, io and nyx

## Aspis

Both themes render the exact same markup; a theme only decides the design.

- `tokens/<theme>.css` defines the whole `--aspis-*` vocabulary for that theme.
- `base.css` is the structure every theme shares and reads tokens only.
- `shape/<theme>.css` holds what a token cannot express (focus dimming, bezels, rails, grain).
- `aspis.test.ts` fails when the two themes drift apart: different token sets, a component without a shape in
  either theme, literal colours in structure, or styled classes that no component renders.
- The theme lives in `state.db` and is pushed to every open client. `T` toggles it, `Ctrl K` opens commands.

## Layout

```text
packages/core      zod schemas and shared types
packages/store     SQLite access, migrations and change watching
packages/aspis     design system: --aspis-* tokens, io and nyx themes, React components
apps/server        local HTTP and WebSocket server, compiled to the sidecar
apps/ui            React views
apps/desktop       Tauri shell and NSIS installer
scripts            developer tooling
```

## Develop

Requires Bun 1.3, Rust stable with the MSVC toolchain, and WebView2.

```bash
bun install
bun run dev
```

- `bun run dev:web` serves the UI on `http://localhost:1420` against a server on port 4319 (token `dev`).
- `bun run test`, `bun run typecheck` and `bun run e2e` are what CI runs. `bun run e2e -- --update-snapshots`
  refreshes the screenshot baselines in `e2e/__screenshots__` after an intended visual change.
- `bun run release` builds the installer into `apps/desktop/src-tauri/target/release/bundle/nsis`. Updater
  artifacts are signed, so the build needs `TAURI_SIGNING_PRIVATE_KEY` (path or content of the private key)
  and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; CI reads both from repository secrets. The public key lives in
  `tauri.conf.json`. Losing the private key means installed apps can no longer verify new releases.
- `node scripts/snap-installed.ts <prefix> [view key]` launches the installed app with WebView2 remote debugging
  and saves its window in both themes.

## License

MIT
