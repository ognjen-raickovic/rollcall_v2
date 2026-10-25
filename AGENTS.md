# RollCall: Codex instructions

RollCall helps tabletop players discover, organize, and join gaming events. This repository
started as the frontend MVP for AI-DEV 2026 Workshop 3, based on
`jovanp-najveci/ai-frontend-starter`. Backend Milestone 1 adds an independent API/database
foundation; Milestone 2A adds GeoNames imports and backend place search. Milestone 2B
connects frontend country/city selection to that API. Milestone 3A adds real Supabase Auth
and verified backend identity; event CRUD/attendance and public user/game catalogs remain mocks.

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
- Keep the starter stack and feature boundaries. Workshop 3 remains a frontend mock demo;
  backend work is scoped by the milestones in `SPEC.md`. Frontend features never import each
  other, including types; routes compose them. Read `backend/AGENTS.md` and
  `docs/backend-architecture.md` before backend or migration work.
- User profiles/games remain read-only mock catalogs. Users own real Supabase Auth and a
  separate, explicitly enabled development-only demo session. Real account IDs are UUIDs;
  demo IDs are numeric and must never be equated or coerced. Pass demo identity through
  route composition; a real login grants no mock host/attendance identity.
- Keep mock records inside each feature's `api/`; shared request/error/reference helpers may
  live in `src/lib`. Components use query hooks, not API modules directly.
- Update `docs/entities.md` alongside entity/API changes, and `SPEC.md` alongside scope changes.
- Curated event tags and experience compatibility come from `frontend/src/features/events/event-tags.ts`.
  Cover preparation belongs to events; bounded image data URLs are mock-only and never stored
  in browser storage. Supabase Storage is planned for real pictures in a later backend
  milestone; do not add uploads or buckets during geography work.
- Theme tokens live in `frontend/src/index.css`; `src/lib/theme.ts` and the early HTML script
  share the `rollcall.theme` preference key. Default to dark and keep blocked-storage fallback.
- Use a separate GitHub feature branch per task/person; review through PRs. Inspect existing
  changes, preserve teammates' work, and coordinate shared contract/router/token/lock files.
- Do not commit, push, or merge without explicit user approval. Never expose secrets or env files.
- Keep database credentials and privileged keys server-side. The runtime API uses only an
  unprivileged Supabase key with explicit grants/RLS for geography reads. Never add a
  service-role bypass as a shortcut. Do not create, alter, reset, link, or deploy a remote
  Supabase project without explicit approval. Local reset scripts must remain explicitly local.
- Geographic imports are separate local maintenance commands, never API request paths.
  Read `docs/geographic-import.md` before imports. Preserve city IDs/references, retain
  source identifiers and report real counts/checksums. Do not reset a populated local
  database without checking what must be preserved. Keep downloaded datasets out of Git.
- Milestone 3A implements registration/login/logout, confirmation, recovery and verified
  `GET /api/me`. Read `docs/authentication.md`. Only Auth uses a browser Supabase client
  with a publishable/anon key; never expose privileged keys. Keep event CRUD/attendance
  mocked. Demo selection requires both Vite development mode and explicit opt-in, and
  production builds cannot impersonate fixtures. Profile editing/game experience are 3B;
  persistent UUID event integration is Milestone 4. No invitations or administration.
  Read `docs/location-ui.md` before changing location controls or event-location adapters.
- Geography owns its API/hooks and controls. Routes compose them into event render slots;
  shared `src/lib/location.ts` defines the location reference without cross-feature imports.
  Never invent geographic IDs or silently select an ambiguous legacy fixture location.
- Event forms require a confirmed city suggestion, clear it on country/text changes, and
  allow an empty venue. Exact addresses render only for the host/current participants;
  this is a demo UI safeguard, not server-side privacy or authorization.
- Frontend mock IDs remain numeric. Database profiles reference Supabase Auth UUIDs and
  database events use UUIDs; do not coerce IDs or silently migrate frontend models.
- Run commands from the repository root: `pnpm install`, `pnpm dev`, `pnpm format`,
  `pnpm typecheck`, `pnpm lint`, `pnpm build`. Typecheck/lint/build cover both packages;
  `pnpm dev` still starts only the frontend, `pnpm dev:backend` starts the API.
  Run `pnpm test:mock`, `pnpm test:backend`, and available local database/integration checks.
  On PowerShell with blocked `.ps1` shims,
  use `pnpm.cmd` with the same arguments.
- Before handoff, typecheck, lint (including boundaries), and build must pass. For UI changes,
  inspect routes at 375 px and 1440 px and check the console using Playwright MCP or local
  Playwright when available. Disclose unavailable checks, changes, and remaining limitations.
  Report SQL reviewed separately from migrations actually executed, and mocked API tests
  separately from database-backed integration tests. Never claim unexecuted checks passed.

Claude's commands, format hook, and UI reviewer remain in `.claude/`. Codex performs equivalent
checks using available tools; Claude hooks do not automatically run for Codex edits.
