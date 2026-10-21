# RollCall

RollCall helps tabletop players discover, organize, and join gaming events.

This is a monorepo: one repository for the whole app.
- `frontend/`: React app (Workshop 3). Details in @frontend/CLAUDE.md
- `backend/`: API, database and auth (next workshop)
- `docs/entities.md`: entities and the API contract shared by frontend and backend

## Language
All code, identifiers, comments, commit messages, docs and UI copy are in English.
You may talk to me in any language.

## Commands (run from the repo root)
- `pnpm install`: installs dependencies for every package in the workspace
- `pnpm dev`: frontend dev server at http://localhost:5173
- `pnpm typecheck`: TypeScript check
- `pnpm lint`: oxlint and the boundary check between features
- `pnpm build`: production build
- `pnpm format`: Prettier formats `frontend/src/`

## Working in the monorepo
- One change that touches frontend and backend goes in one commit or pull request
- When an entity changes, update `docs/entities.md` in the same change
- Run commands from the root; scripts are forwarded with `pnpm --filter <package>`

## RollCall scope and shared workflow
- Read @SPEC.md for scope, @frontend/DESIGN.md for visuals, and @docs/entities.md for contracts.
- @AGENTS.md is Codex's entry point and references these same starter rules.
- Workshop 3 is frontend only: no backend, database, persistence, or real authentication.
- Domains are `users`, `games`, and `events`. Users/games are read-only catalogs; events
  support CRUD and join/leave. Writes receive an explicit mock actor, not a real session.
- Keep foundation routes simple until finished pages are requested. Preserve `.claude/`.
- Share a concrete plan before edits. Explicit task authorization takes precedence over
  generic template interviews, approval steps, and visual variants.
- Use one GitHub feature branch per task/person and pull requests for review. Coordinate
  shared contract, routing, token, and lockfile changes with your teammate.
- Do not commit, push, or merge without explicit user approval. Run typecheck, lint, and
  build before handoff; use `/check` and the UI reviewer for page work before a commit.
- On PowerShell with blocked `.ps1` shims, use `pnpm.cmd` for the same root commands.
