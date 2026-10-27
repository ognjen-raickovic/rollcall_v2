# RollCall: Codex instructions

RollCall helps tabletop players discover, organize, and join gaming events. This repository
started as the frontend MVP for AI-DEV 2026 Workshop 3, based on
`jovanp-najveci/ai-frontend-starter`. Backend Milestone 1 adds an independent API/database
foundation; Milestone 2A adds GeoNames imports and backend place search. Milestone 2B
connects frontend country/city selection to that API. Milestone 3A adds real Supabase Auth
and verified backend identity. Milestone 3B adds real editable UUID profiles and per-game
experience. Milestones 4A/4B add persistent event backend APIs and transactional attendance; React event CRUD/attendance
and their numeric demos remain separate. Milestone 4C-1 connects public homepage/discovery
and UUID details to real reads; 4C-2 connects real event mutations and participation.
Milestone 4D adds persistent, private-bucket event covers with checked upload/access/cleanup.

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
- Users own real profiles/experience and Supabase Auth, alongside separate mock catalogs and a
  separate, explicitly enabled development-only demo session. Real account IDs are UUIDs;
  demo IDs are numeric and must never be equated or coerced. Pass demo identity through
  route composition; a real login grants no mock host/attendance identity.
- Keep mock records inside each feature's `api/`; shared request/error/reference helpers may
  live in `src/lib`. Components use query hooks, not API modules directly.
- Update `docs/entities.md` alongside entity/API changes, and `SPEC.md` alongside scope changes.
- Curated event tags and experience compatibility come from `frontend/src/features/events/event-tags.ts`.
  Cover preparation belongs to events; bounded image data URLs are mock-only and never stored
  in browser storage. Real cover drafts become multipart files through the separate 4D
  image API, never JSON image references. Read `docs/event-covers.md` before image work.
- Theme tokens live in `frontend/src/index.css`; `src/lib/theme.ts` and the early HTML script
  share the `rollcall.theme` preference key. Default to dark and keep blocked-storage fallback.
- Use a separate GitHub feature branch per task/person; review through PRs. Inspect existing
  changes, preserve teammates' work, and coordinate shared contract/router/token/lock files.
- Do not commit, push, or merge without explicit user approval. Never expose secrets or env files.
- Keep database credentials and privileged keys server-side. The runtime API uses only an
  unprivileged Supabase key with focused grants/RLS for geography, profiles and checked event RPCs. Never add a
  service-role bypass as a shortcut. Do not create, alter, reset, link, or deploy a remote
  Supabase project without explicit approval. Local reset scripts must remain explicitly local.
- Geographic imports are separate local maintenance commands, never API request paths.
  Read `docs/geographic-import.md` before imports. Preserve city IDs/references, retain
  source identifiers and report real counts/checksums. Do not reset a populated local
  database without checking what must be preserved. Keep downloaded datasets out of Git.
- Milestone 3A implements registration/login/logout, confirmation, recovery and verified
  `GET /api/me`. Read `docs/authentication.md`. Only Auth uses a browser Supabase client
  with a publishable/anon key; never expose privileged keys. Production event reads use the
  real API; 4C-2 frontend mutations use verified UUID sessions. Numeric mocks live under development-only
  `/demo/events` routes. Demo selection requires Vite development mode and explicit opt-in, and
  production builds cannot impersonate fixtures. Milestone 3B adds real profiles/experience;
  persistent UUID event APIs are Milestone 4A; attendance is 4B and frontend integration is 4C.
  No invitations or administration.
  Read `docs/location-ui.md` before changing location controls or event-location adapters.
- Read `docs/profiles.md` for real profile contracts. Profile writes derive identity from the
  verified bearer token, use an isolated unprivileged user context and preserve owner RLS.
  Public profile DTOs omit email, birth year, declaration timestamps and roles. Birth year
  is optional/private/self-declared; game experience is public and self-declared, never a
  joining requirement. Reuse the existing registration initializer and database game catalog.
- Geography owns its API/hooks and controls. Routes compose them into event render slots;
  shared `src/lib/location.ts` defines the location reference without cross-feature imports.
  Never invent geographic IDs or silently select an ambiguous legacy fixture location.
- Read `docs/events-api.md` before real event work. Discovery is bounded, public/scheduled
  only; content writes are host-only. Private details and exact addresses require the host
  or current membership in 4B. Derive all actors from verified tokens; never submitted IDs.
  Attendance locks the event and validates current visibility/state/time before changing
  the existing membership table. Preserve closed client tables, executor/trigger-role RLS,
  explicit ACLs and empty search paths. Private outsiders cannot join; no experience/age
  eligibility or admin override. Storage is implemented in 4D; private codes/role authorization (5)
  remain separate work. Read integration is documented in `docs/event-frontend-verification.md`;
  real mutation integration and browser acceptance are in `docs/event-actions-verification.md`.
- Real event reads use dedicated UUID DTOs and TanStack Query keys, never numeric adapters.
  Public pages never fall back to mocks. Detail keys include the verified viewer; destroy
  protected queries before auth transitions, consume abort signals and recheck session
  identity after HTTP. Addresses require the matching viewer and host/current membership.
  Public summaries have no price/address fields; do not invent them. Real mutations capture
  their initiating session, validate strict write DTOs and cancel stale detail reads before
  applying acknowledged results. Recheck identity before cache effects/navigation; no optimism.
  Leave hides protected addresses and removes private details on departure. Do not attach
  mock actions to UUID events. Real forms upload validated multipart images after saving
  metadata; retain the saved UUID on partial failure to prevent duplicate creation.
- Cover writes/signing require the backend-only operation key plus existing verified user
  permissions. Never expose the key in Vite, caller payloads, logs or tracked files. Storage
  RLS must independently restrict exact reserved paths and current associations. No service-role
  bypass, direct Storage metadata manipulation or long-lived client signing. Signed access is
  60 seconds; document its residual window. Clear viewer-specific cover queries on auth/access
  changes. Retire/clean old objects only after safe association changes; preserve bounded retry
  work and use supported Storage APIs. Local setup is `pnpm covers:setup`, never a hosted operation.
- Event forms require a confirmed city suggestion, clear it on country/text changes, and
  allow an empty venue. Exact addresses render only for the host/current participants;
  real API DTOs enforce this server-side; numeric demos only simulate the safeguard.
- Frontend mock IDs remain numeric. Database profiles reference Supabase Auth UUIDs and
  database events use UUIDs; do not coerce IDs or silently migrate frontend models.
- Run commands from the repository root: `pnpm install`, `pnpm dev`, `pnpm format`,
  `pnpm typecheck`, `pnpm lint`, `pnpm build`. Typecheck/lint/build cover both packages;
  `pnpm dev` still starts only the frontend, `pnpm dev:backend` starts the API.
  Run `pnpm test:mock`, `pnpm test:backend`, and available local database/integration checks.
  `pnpm test:events` covers real event clients and pagination/cache/privacy boundaries.
  `pnpm test:event-actions` covers mutation contracts, session/cache privacy and real form/date mapping.
  `pnpm test:event-covers` covers cover requests, signed access and cache/account boundaries.
  On PowerShell with blocked `.ps1` shims,
  use `pnpm.cmd` with the same arguments.
- Before handoff, typecheck, lint (including boundaries), and build must pass. For UI changes,
  inspect routes at 375 px and 1440 px and check the console using Playwright MCP or local
  Playwright when available. Disclose unavailable checks, changes, and remaining limitations.
  Report SQL reviewed separately from migrations actually executed, and mocked API tests
  separately from database-backed integration tests. Never claim unexecuted checks passed.

Claude's commands, format hook, and UI reviewer remain in `.claude/`. Codex performs equivalent
checks using available tools; Claude hooks do not automatically run for Codex edits.

## Milestone 5A

5A invitations are implemented: read docs/private-invitations.md. Never log/persist codes or weaken checked-RPC capability, encryption, durable attempt commits, event-lock rechecks or existing attendance triggers. Code management is host-only; role management is 5B-1 and moderation remains 5B-2.

## Milestone 5B-1

Read docs/administration.md before role work. Reuse private.account_roles and verified current UUID permissions. Only superadmins manage user/admin transitions; no self/superadmin changes or private-data override. Preserve independent RPC checks, role-lock serialization and atomic append-only auditing. Bootstrap is operator-confirmed and literal-loopback-only; never provision a personal account automatically or expose a bootstrap endpoint. Clear viewer-scoped administration caches on Auth transitions.

## Milestone 5B-2A

Read docs/event-moderation.md for 5B-2A. Only checked reported-event cancellation expands moderator writes; ordinary host editing/deletion and private-data boundaries remain unchanged. Preserve durable report attempt commits, current-role checks, shared role locks, parent-first event/report serialization, append-only atomic audits and anti-reactivation protection. Never expose reporter identities or protected fields in report projections. Keep numeric demos isolated.

## Milestone 5B-2B

Read docs/account-suspensions.md before protected application work. All new protected RPCs must use the live SQL active-account guard before domain locks, with role/account ordering preserved. Keep identity/self-status/logout/recovery available and public anonymous browsing safe. Preserve state/audit atomicity, explicit role eligibility, raw-table/Storage enforcement and UUID-keyed status/private-cache cleanup. Never bypass suspension with an old JWT, stale UI role or a service-role client.

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
