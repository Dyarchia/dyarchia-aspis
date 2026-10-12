# Dyarchia Aspis

The Dyarchia desktop app: Build and Kanban over a single local source of truth.

**Alpha. Not a release.** Every sprint ships a prerelease installer under GitHub Releases. The installer is
unsigned, so Windows SmartScreen warns about an unknown publisher. It installs for the current user, without
elevation, and keeps its state in `~/.dyarchia-aspis/state.db`.

## Stack

- Tauri 2 shell with a Bun-compiled Hono sidecar (`aspis-server`)
- React, Vite and Tailwind v4 for the views
- SQLite (`bun:sqlite`, WAL) as the shared source of truth
- Aspis design system with two themes, io and nyx

## Layout

```text
packages/core      zod schemas and shared types
packages/store     SQLite access, migrations and change watching
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
- `bun run test` and `bun run typecheck` are what CI runs.
- `bun run release` builds the installer into `apps/desktop/src-tauri/target/release/bundle/nsis`.
- `node scripts/snap-installed.ts out.png` launches the installed app with WebView2 remote debugging and
  saves a screenshot of its window.

## License

MIT
