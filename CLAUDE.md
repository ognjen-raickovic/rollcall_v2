# [App name]

[One sentence: what the app does and for whom.]

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
