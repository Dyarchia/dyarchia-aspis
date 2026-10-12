# Dyarchia Aspis

The Dyarchia desktop app: Build and Kanban over a single local source of truth.

**Alpha. Not a release.** Every sprint ships a prerelease installer under GitHub Releases.

## Stack

- Tauri 2 shell with a Bun-compiled Hono sidecar
- React, Vite and Tailwind v4 for the views
- SQLite (`bun:sqlite`) in `~/.dyarchia-aspis/state.db`
- Aspis design system with two themes, io and nyx

## License

MIT
