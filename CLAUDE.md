# RollCall

RollCall helps tabletop players discover, organize, and join gaming events.

This is a monorepo: one repository for the whole app.

- `frontend/`: React app (Workshop 3). Details in @frontend/CLAUDE.md
- `backend/`: Fastify API and geography maintenance tools; see @backend/AGENTS.md and @backend/README.md
- `supabase/`: local configuration, SQL migrations, development seeds and database tests
- `docs/entities.md`: entities and the API contract shared by frontend and backend

## Language

All code, identifiers, comments, commit messages, docs and UI copy are in English.
You may talk to me in any language.

## Commands (run from the repo root)

- `pnpm install`: installs dependencies for every package in the workspace
- `pnpm dev`: frontend dev server at http://localhost:5173
- `pnpm dev:backend`: backend dev server at http://127.0.0.1:3001
- `pnpm typecheck`: TypeScript checks for frontend and backend
- `pnpm lint`: oxlint for both packages and the frontend feature boundary check
- `pnpm build`: production builds for both packages
- `pnpm test:mock`: existing frontend mock API checks
- `pnpm test:backend`: backend automated tests without a running database
- `pnpm test:profiles`: frontend profile client account-isolation/public-projection checks
- `pnpm test:integration`: opt-in local Supabase geography integration checks
- `pnpm db:start` / `pnpm db:stop`: local Supabase stack
- `pnpm db:reset`: reset the local database and apply migrations/development seeds
- `pnpm db:lint` / `pnpm db:test`: local SQL lint and database tests
- `pnpm db:test:concurrency`: real local PostgreSQL final-seat/capacity race checks
- `pnpm geography:import`: local GeoNames import; see @docs/geographic-import.md for flags/setup
- `pnpm format`: Prettier formats `frontend/src/`

## Working in the monorepo

- One change that touches frontend and backend goes in one commit or pull request
- When an entity changes, update `docs/entities.md` in the same change
- Run commands from the root; scripts are forwarded with `pnpm --filter <package>`

## RollCall scope and shared workflow

- Read @SPEC.md for scope, @frontend/DESIGN.md for visuals, and @docs/entities.md for contracts.
- @AGENTS.md is Codex's entry point and references these same starter rules.
- Workshop 3 remains a frontend-only demo. Backend Milestone 1 adds schema/migrations,
  local Supabase infrastructure and three read-only geography/health endpoints. Milestone 2A
  adds GeoNames imports and backend search; Milestone 2B integrates country/city selection.
  Milestone 3A adds real Supabase Auth and verified `GET /api/me`. Event CRUD/attendance and
  Milestone 3B adds real profiles and per-game experience with a read-only database game catalog.
  Numeric event/demo catalogs remain separate; persistent event APIs are later work.
- Optional event covers are prepared in the browser and passed through mock APIs as bounded
  data URLs. Do not persist images in browser storage or connect cloud uploads during geography work.
  Supabase Storage is the planned backend provider; transport, ownership and lifecycle will
  be implemented later. Curated tags/experience rules live in events.
- Light/dark themes share semantic tokens. Dark is the default; the theme preference
  persists in localStorage (`rollcall.theme`), independent of the tab-scoped demo session
  and the SDK-managed real Auth session.
- Domains are `users`, `games`, `events`, and `geography`. Users owns real UUID profiles and
  per-game experience. Games provides a real read-only profile catalog alongside existing
  event mocks; event writes receive an explicit numeric mock actor through route composition.
  Users also own real Supabase Auth UUID identity and a separate explicitly enabled
  development-only demo session. A real account must never become a numeric fixture actor.
- Keep foundation routes simple until finished pages are requested. Preserve `.claude/`.
- Share a concrete plan before edits. Explicit task authorization takes precedence over
  generic template interviews, approval steps, and visual variants.
- Use one GitHub feature branch per task/person and pull requests for review. Coordinate
  shared contract, routing, token, and lockfile changes with your teammate.
- Do not commit, push, or merge without explicit user approval. Run typecheck, lint, and
  build before handoff; use `/check` and the UI reviewer for page work before a commit.
- On PowerShell with blocked `.ps1` shims, use `pnpm.cmd` for the same root commands.

## Backend rules shared with Codex

- Read @backend/AGENTS.md, @docs/backend-architecture.md and @docs/database-schema.md before
  backend changes. Follow the same scope and authorization model as Codex.
- Use a server-only unprivileged Supabase client for runtime geography reads. Combine
  explicit grants with RLS; do not use a service-role key or trust frontend role checks.
- Database profile IDs are Supabase Auth UUIDs; event IDs are UUIDs. Preserve existing
  numeric frontend mock IDs until an explicit integration milestone introduces adapters.
- Keep exact addresses, private age information, roles and future invitation secrets out
  of public event/profile responses. Never assign roles from client-controlled metadata.
- No remote Supabase creation, linking, migrations, resets or deployment without explicit
  approval. Root reset/lint/test scripts target local development only.
- Geographic imports use a separate loopback-only maintenance connection, never the runtime
  client. Follow @docs/geographic-import.md, preserve city IDs/references and source identity,
  and keep downloaded files out of Git. Check local data before considering any reset.
- Milestone 3A adds Supabase email/password registration, login/logout, confirmation/recovery,
  persistent refreshed sessions and verified `GET /api/me`. Read @docs/authentication.md.
  Browser Auth may use only a publishable/anon key; privileged credentials stay server-side.
  Demo selection requires Vite development mode plus explicit opt-in and is unavailable in
  production builds. Preserve numeric event/catalog mocks and themes. Milestone 3B implements
  real profiles/experience; persisted UUID events remain Milestone 4. No room codes or administration.
- Follow @docs/profiles.md for owner-only profile writes, private birth-year handling, public-safe
  profile DTOs and the real game catalog. Identity comes from verified tokens, never submitted
  actors. RLS/grants must also block cross-user/role/private-data access through the Data API.
- Follow @docs/location-ui.md for shared location references, route-composed geography controls,
  required suggestion selection, legacy compatibility and the optional venue/address boundary.
- Report executed backend/database checks and unavailable checks separately. Prepared SQL
  and mocked repository tests are not proof that a migration or live endpoint succeeded.
