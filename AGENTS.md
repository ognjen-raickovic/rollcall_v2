# RollCall: Codex instructions

RollCall helps tabletop players discover, organize, and join gaming events. This repository
is the frontend foundation for AI-DEV 2026 Workshop 3, based on `jovanp-najveci/ai-frontend-starter`.

## Shared rules

Read `SPEC.md`, `CLAUDE.md`, `frontend/CLAUDE.md`, and `docs/entities.md` before domain work.
Apply the path-specific rules in `.claude/rules/`. Before UI work, read `frontend/DESIGN.md`
and `.claude/skills/design-system/SKILL.md`. These are shared instructions, not separate
architectures for the two assistants. Keep them consistent. Preserve `.claude/`.

The user's explicit task takes precedence over generic command templates, including
interviews, approval steps, and visual variants. Share a concrete plan before editing.
Keep foundation routes simple until finished pages are requested.

## Working agreements

- All code, docs, comments, commit messages, and UI copy are in English.
- Keep the starter stack and feature boundaries. No backend, database, persistence, or real auth
  in Workshop 3. Features never import each other, including types; routes compose them.
- Users/games are read-only catalogs. Events own CRUD and attendance. Use numeric reference IDs.
- Keep mock records inside each feature's `api/`; shared request/error/reference helpers may
  live in `src/lib`. Components use query hooks, not API modules directly.
- Update `docs/entities.md` alongside entity/API changes, and `SPEC.md` alongside scope changes.
- Use a separate GitHub feature branch per task/person; review through PRs. Inspect existing
  changes, preserve teammates' work, and coordinate shared contract/router/token/lock files.
- Do not commit, push, or merge without explicit user approval. Never expose secrets or env files.
- Run commands from the repository root: `pnpm install`, `pnpm dev`, `pnpm format`,
  `pnpm typecheck`, `pnpm lint`, `pnpm build`. On PowerShell with blocked `.ps1` shims,
  use `pnpm.cmd` with the same arguments.
- Before handoff, typecheck, lint (including boundaries), and build must pass. For UI changes,
  inspect routes at 375 px and 1440 px and check the console using Playwright MCP or local
  Playwright when available. Disclose unavailable checks, changes, and remaining limitations.

Claude's commands, format hook, and UI reviewer remain in `.claude/`. Codex performs equivalent
checks using available tools; Claude hooks do not automatically run for Codex edits.
