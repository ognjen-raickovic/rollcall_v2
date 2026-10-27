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
- `pnpm test:events`: real event read client, pagination and viewer-privacy checks
- `pnpm test:event-actions`: real event mutation/cache/session and form/date mapping checks
- `pnpm test:event-covers`: signed cover access, multipart and cache/account checks
- `pnpm covers:setup`: local-only server operation-key setup; never prints credentials
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
  Milestone 3A adds real Supabase Auth and verified `GET /api/me`.
  Milestone 3B adds real profiles and per-game experience with a read-only database game catalog.
  Milestones 4A/4B add persistent event backend APIs and transactional attendance. React event CRUD/attendance and numeric
  demo catalogs remain separate. 4C-1 connects homepage/discovery/UUID details to real reads;
  4C-2 connects real frontend CRUD/participation. Numeric demos are development-only `/demo/events` paths.
- Real event covers use the 4D private Storage image API; read @docs/event-covers.md and
  @docs/event-cover-verification.md. Browser drafts stay in memory and become multipart
  files after event save. Numeric demos retain bounded data URLs. Never persist drafts or
  signed URLs in browser storage, and never submit images through normal event JSON.
  Curated tags/experience rules live in events.
- Light/dark themes share semantic tokens. Dark is the default; the theme preference
  persists in localStorage (`rollcall.theme`), independent of the tab-scoped demo session
  and the SDK-managed real Auth session.
- Domains are `users`, `games`, `events`, and `geography`. Users owns real UUID profiles and
  per-game experience. Games provides a real read-only profile catalog alongside existing
  event mocks; only demo writes receive an explicit numeric actor through route composition.
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
  real profiles/experience; 4A implements persistent UUID event APIs. Attendance is 4B,
  frontend integration 4C, Storage 4D and private codes/role authorization 5.
- Follow @docs/profiles.md for owner-only profile writes, private birth-year handling, public-safe
  profile DTOs and the real game catalog. Identity comes from verified tokens, never submitted
  actors. RLS/grants must also block cross-user/role/private-data access through the Data API.
- Follow @docs/events-api.md for bounded public/scheduled discovery and verified host-only
  content writes. In 4B private details/addresses require the host or current membership.
  Attendance uses verified subjects, event row locks and the existing membership/counter
  infrastructure; private outsiders cannot join. Raw tables stay closed to API roles; use
  checked RPCs, non-bypass executor/trigger roles, explicit ACLs/RLS and empty search paths.
  Invitation admission follows 5A; no self-declared eligibility checks or admin override. Keep numeric demo
  controllers isolated from real UUID records. See @docs/attendance-verification.md for
  backend checks, @docs/event-frontend-verification.md for 4C-1 and
  @docs/event-actions-verification.md for 4C-2 mutation/browser verification.
- Real event clients validate dedicated backend DTOs; summary cards contain no invented
  price or protected address. Viewer keys include event/account UUIDs; remove sensitive
  queries before auth transitions, abort old reads and recheck identity after HTTP. Keep
  tokens out of keys/URLs/logs, constrain request origins and reject redirects. No mock
  fallback. Real mutation hooks capture the initiating UUID/session, abort on account changes,
  cancel stale reads and recheck identity before cache effects/navigation. Use acknowledged
  server state, no optimistic attendance. Leave hides addresses and removes private details;
  inactive mutation data is discarded. Real cover writes/signing require a server-only
  operation capability alongside verified ownership/access, not a service-role bypass.
  Storage RLS restricts exact reserved paths/current association; only backend requests sign
  for 60 seconds. Clear cover caches on access changes. Retain saved UUIDs for partial-upload
  retries; clean retired files through supported Storage APIs with bounded recoverable work.
  Public filters use bounded cursor pages;
  category filters apply to loaded pages with Load More until exhausted.
- Follow @docs/location-ui.md for shared location references, route-composed geography controls,
  required suggestion selection, legacy compatibility and the optional venue/address boundary.
- Report executed backend/database checks and unavailable checks separately. Prepared SQL
  and mocked repository tests are not proof that a migration or live endpoint succeeded.

## Milestone 5A

5A invitations are implemented: read docs/private-invitations.md. Preserve host authorization, encrypted recovery, backend-only verification, durable throttling and event-row serialization. Keep codes out of DTOs, URLs, logs and persistent caches. Role management is 5B-1; moderation remains 5B-2.

## Milestone 5B-1

Read @docs/administration.md for implemented 5B-1 current-role permissions, superadmin-only role/audit operations and local-only explicit bootstrap. Keep private.account_roles authoritative, independent RPC authorization and append-only atomic audits. No metadata-derived permissions, self/superadmin changes, automatic personal provisioning or private event/profile/Storage override. 5B-2 moderation remains deferred.

## Milestone 5B-2A

Read @docs/event-moderation.md. 5B-2A implements private event reports and narrow checked admin/superadmin dismissal/cancellation. Preserve DB authorization, durable limiter commits, parent-first event locks, demotion coordination, atomic immutable audits and limited snapshots. No ordinary host-control override, private addresses/codes/covers, reporter identity exposure or account suspension.

## Milestone 5B-2B

Read @docs/account-suspensions.md. 5B-2B separates suspension from roles and enforces current status in Fastify and SQL/RLS/Storage. Guard new protected RPCs before domain locks; preserve exclusive role-change ordering and target account locks. No Auth ban/delete or automatic event/membership removal. UI status is presentation only; clear private caches on detection and account changes.

## Milestone 6A-1: staging preparation

Read [the staging procedure](docs/hosted-supabase-staging.md) before hosted work. Preparation does not authorize
remote mutations, CLI linking or deployment. Keep ordinary local env/config/data unchanged;
use separate ignored operator configuration and dry-run defaults. Preserve local-only guards
and unprivileged runtime access. Full reviewed 5B-2B source is a rollout prerequisite; do not
copy just its SQL to bypass the audit. 6A-2 requires separate explicit deployment approval.

## Milestone 6B-1: hosting preparation

Read [application hosting](docs/application-hosting.md) before hosting changes. Preserve same-origin API paths,
production demo isolation, unprivileged Supabase clients and viewer privacy. Application
hosting does not use operator files or database credentials; never inspect private operator
material for this work. Keep maintenance enabled, previews protected and automatic deployments
disabled until the relevant acceptance/approval gates pass. Preparation is not deployment.

## Registration identity and application startup

Read docs/registration.md before registration changes. New accounts require case-preserving, case-insensitively unique
usernames and private DOB through migration 17 plus forward casing migration 18 and backend-prepared tickets. Never
send DOB to Auth metadata/JWTs or public DTOs. Preserve legacy accounts, email confirmation,
private owner RLS, durable rate counters and backend-only capability checks. dev:all is local;
staging:smoke reads only separate ignored application configuration, never operator files.

## Account navigation and discovery (19–20)

Read docs/navigation-discovery.md for current contracts and verification limits. Discovery
filters/order run in SQL before pagination and stay public/scheduled only. My Events is
independently active-owner/member authorized and viewer-cached; never use discovery as
its authorization. Preserve sort-bound cursors, civil-date/DST handling, logout confirmation
and account-switch cache destruction. Deletion and username recovery remain separately gated.

## Profile editor and atomic game saves (21)

Read docs/profiles.md for the centered tabbed editor and complete-set Save contract.
Keep drafts owner-scoped and in memory, preserve them across tab changes, and use the
transactional expected-set replacement instead of sequential game mutations. Preserve
statement-lock serialization, active-account checks and caller RLS. Full account dates
use UTC; event dates do not change. Deletion remains disabled pending the separate
reauthentication, freeze, retention and isolated-worker gates.
