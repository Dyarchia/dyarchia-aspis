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

## Scheduled runs

- Nothing polls. Each Scheduled card has its own one-shot Task Scheduler entry at its time, which starts
  `dyarchia-aspis.exe --dispatch` as the signed-in user, so cards run with the app closed. Work that is due right
  now (a card past its time, one you unblocked, an audit) is started at once. Any change to the board brings Task
  Scheduler in line with it; the uninstaller removes every entry.
- The dispatcher starts every due card with `claude -p` in its folder, one card per repository at a time. A
  repository that is not on the base branch, or has uncommitted changes, holds the card, the board shows why and
  the card looks again in 15 minutes. When a card finishes, the next one waiting on its repository starts.
- Each card works on `feature/develop/card-<id>-<slug>`, branched from its base (the card's own, else
  `develop`, else origin's default). When the run ends the runner commits there, never pushes, and returns the
  repository to the base branch.
- Failures retry in the same session up to the card's retries, then block it. A final `BLOCKED: <question>` line
  blocks it for you to answer; moving it back to Running resumes the session with your answer. Stop ends a live
  run. Logs live in `~/.dyarchia-aspis/runs/` and stream into the card panel. Every run keeps its session id, so
  any implementer or auditor session can be resumed from the card to talk to it.

## Ready runs

- Settings, Agent CLIs wires Claude Code or Kimi Code with one click: hooks that call `dyarchia-aspis.exe --hook`,
  the `dya-pickup` skill and the `aspis` MCP server, all in that CLI's user settings. Remove takes them back out,
  and so does the uninstaller.
- In the card folder, typing `/dya-pickup` (Kimi: `/skill:dya-pickup`) hands that session the highest-priority
  Ready card for the folder and the CLI, moves it to Running with the session id and puts the repository on the
  card branch. Only a prompt the human types can claim a card.
- Every tool call goes through the guard: a session acts only on its own card, a Blocked or in-Review card stops
  its session, the call is recorded in the card's activity, and what you write in the thread reaches the agent
  at its next tool call or turn end. Sessions that hold no card cost a file lookup and nothing else.
- The agent answers with the MCP tools `card_note`, `card_block` and `card_deliver`. Delivering commits on the card
  branch and moves the card to Review.
- Delivering starts the card's auditor at once, headless and read-only over `git diff base...branch`; its last
  `VERDICT: PASS|FAIL` line becomes the auditor's check and a Windows notification tells you. An auditor that
  cannot run never gets a verdict invented: the reason stays on the card, and you retry the audit or reject it.
- While the card waits on you (Blocked, Review) the agent may still read and answer; anything that changes the
  repository or runs commands is stopped.

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
packages/runner    Scheduled dispatcher, Ready pickup and guard, auditor, CLI wiring
packages/aspis     design system: --aspis-* tokens, io and nyx themes, React components
apps/server        local HTTP and WebSocket server, compiled to the sidecar
apps/ui            React views
apps/desktop       Tauri shell and NSIS installer
e2e                Playwright suites and their screenshot baselines
scripts            developer tooling
```

## Develop

Requires Bun 1.3, Rust stable with the MSVC toolchain, and WebView2.

```bash
bun install
bun run dev
```

- `bun run dev:web` serves the UI on `http://localhost:1420` against a server on port 4319 (token `dev`). The dev
  server starts from `apps/server/src/dev.ts`, which adds `/dev` routes to act as agent, system or auditor
  through the same rules and to run the dispatcher on demand; the sidecar is compiled from `main.ts` and never
  contains them. Set `ASPIS_CLAUDE` to point runs at another executable; tests and e2e use
  `packages/runner/src/fake-claude.ts`, so they need neither the CLI nor a login.
- `bun run test`, `bun run typecheck` and `bun run e2e` are what CI runs. The e2e suite keeps its state in
  `.e2e-state/`, wiped at the start of every run. `bun run e2e -- --update-snapshots=all` rewrites the baselines
  in `e2e/__screenshots__` after an intended visual change.
- `bun run release` builds the installer into `apps/desktop/src-tauri/target/release/bundle/nsis`. Updater
  artifacts are signed, so the build needs `TAURI_SIGNING_PRIVATE_KEY` (path or content of the private key)
  and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; CI reads both from repository secrets. The public key lives in
  `tauri.conf.json`. Losing the private key means installed apps can no longer verify new releases.
- `node scripts/snap-installed.ts <prefix> [view key]` launches the installed app with WebView2 remote debugging
  and saves its window in both themes.

## License

MIT
