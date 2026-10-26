# RollCall

RollCall helps people discover, organize, and join tabletop gaming events: D&D, Magic:
The Gathering, Yu-Gi-Oh!, board games, and social deduction games.

Built for **AI-DEV 2026 Workshop 3**, from
[jovanp-najveci/ai-frontend-starter](https://github.com/jovanp-najveci/ai-frontend-starter).
The frontend includes domain mock APIs, a discovery homepage, Montenegro event discovery
and complete details, demo login, participation, and reusable event creation/editing forms
with inline validation and host authorization.
The final polish adds optional custom event covers, curated multi-select tags, and a
matching light theme alongside the default dark theme.

**Current milestone: 4D.** Homepage/discovery/details and event creation,
editing, deletion, joining and leaving use Fastify/PostgreSQL and real Supabase UUID
accounts. Host-only forms use the real games/geography catalogs; participants gain and
lose address access through verified membership. Numeric workflows remain isolated at
development-only `/demo/events/*`; public pages never fall back to fixtures. Real event
forms now upload persistent covers to a private Supabase Storage bucket, with host-only
replacement/removal, validated WebP processing and short-lived authorized access. See
[cover setup and contracts](docs/event-covers.md), [cover verification](docs/event-cover-verification.md),
[event action verification](docs/event-actions-verification.md) and the historical
[read integration verification](docs/event-frontend-verification.md).

Earlier milestone sections below describe their delivery boundaries; the current real
event behavior includes the 4D integration above.

**Backend Milestone 1** adds an independent Fastify API, Supabase database schema and
local development tools. Its original boundary was health and geography; the current
Milestones 3A/3B implement real authentication and profiles, and 4A adds persistent event
backend APIs. Milestone 4B adds real backend attendance. Milestones 4C-1/4C-2 connect real
frontend reads and mutations; 4D adds persistent event covers.
Start with [backend setup](backend/README.md),
[architecture](docs/backend-architecture.md), [schema](docs/database-schema.md), and
[roadmap](docs/backend-roadmap.md).
**Milestone 2A** adds reproducible GeoNames imports and improved Balkan place search;
the verified local import contains
46,241 GeoNames places across the four countries. See [verification](docs/geographic-verification.md) and
[geographic import](docs/geographic-import.md) for source/license, filters and rerun commands.
Executed checks and local environment limitations are recorded in
[Milestone 1 verification](docs/backend-verification.md).

**Milestone 2B** connects country/city controls to those geography endpoints. Event CRUD,
participation, users, games and demo login remain mocked. Forms require a selected city,
venue is optional, and discovery supports country/city URL filters. See
[location UI integration](docs/location-ui.md) for setup and the transitional event model.
See [Milestone 2B verification](docs/location-ui-verification.md) for executed checks and limitations.

**Milestone 3A** adds real Supabase email/password registration, login/logout, email
confirmation, password recovery and persistent refreshed sessions. Fastify verifies bearer
tokens for `GET /api/me`. Real accounts use UUIDs; numeric demo profiles remain a separate,
explicitly enabled development-only mode. Real accounts cannot act as fixture hosts or
participants. Event CRUD/attendance remains mocked and resets on reload. See
[authentication setup and boundaries](docs/authentication.md).
Executed checks and remaining limits are recorded in
[Milestone 3A verification](docs/authentication-verification.md).

**Milestone 3B** adds real editable UUID profiles and per-game experience backed by PostgreSQL.
Use `/profile` and `/profile/edit` after signing in, or `/users/:userId` for a public profile.
Birth year is optional/private; email and roles never appear in public profile responses.
The real game catalog is read-only and separate from existing event mocks. See
[profile implementation and setup](docs/profiles.md).

**Milestone 4A** adds real PostgreSQL-backed event discovery/details and authenticated
host-only create/edit/delete at `/api/events`. Discovery is paginated and public/scheduled
only; private details and exact addresses are host-only. React event CRUD/attendance still
uses numeric mocks and does not call these endpoints. No join/leave API, uploads, private
codes or admin privileges are added. See [event API contracts](docs/events-api.md) and
[executed verification](docs/events-api-verification.md). Apply the two additive migrations
with `pnpm exec supabase db push --local`; no new environment variables or dependencies
are needed, and existing local data must be preserved.

**Milestone 4B** adds authenticated persistent join/leave, serialized capacity management,
idempotent attendance and viewer-aware event details. Hosts/current participants receive
protected addresses; private outsiders remain concealed and cannot join by UUID. React
events/participation stay mocked until 4C. Apply the additive attendance migration with
`pnpm exec supabase db push --local`, preserving local data. See
[attendance contracts](docs/events-api.md#attendance-requests-state-and-idempotency) and
[verification](docs/attendance-verification.md). No new dependencies or environment variables
are required; uploads, private codes and administration remain deferred.

## Setup

Use Node.js 22.12+ (or a newer supported LTS) and the pnpm version pinned in `package.json`.
Run everything from the repository root:

```bash
npm install -g pnpm@12.14.0       # once, if needed
pnpm install
pnpm dev                        # http://localhost:5173
pnpm typecheck                  # frontend + backend
pnpm lint                       # both packages + frontend feature boundaries
pnpm build                      # frontend/dist and backend/dist
pnpm test:mock                   # mock API integration checks, no backend needed
pnpm test:backend                # backend tests without a running database
pnpm test:profiles               # focused frontend profile/account-isolation checks
pnpm test:events                 # real event clients, pagination and viewer privacy
pnpm test:event-actions          # mutation contracts, cache/privacy, form/date mapping
pnpm test:event-covers           # signed access, multipart requests and cover cache safety
pnpm format                     # Prettier on frontend/src
pnpm --filter frontend preview  # preview the production build
```

On PowerShell with disabled script execution, use `pnpm.cmd` instead of `pnpm`.
The frontend builds without a running backend, but public event browsing and country/city
selection require Fastify and local Supabase; unavailable services display errors and
retry controls, without a silent fixture fallback. Real authentication additionally requires
the public local Supabase URL and publishable/anon key in `frontend/.env`.

For local backend development, install/start Docker Desktop and run from the root:

```bash
pnpm db:start
# Copy backend/.env.example to backend/.env and set the local URL/key from Supabase status.
# Copy frontend/.env.example to frontend/.env and set its public local URL/key too.
pnpm exec supabase db push --local # apply pending migrations without resetting geography
pnpm covers:setup                # local-only server operation key; writes ignored backend/.env
pnpm dev:backend                 # http://127.0.0.1:3001
pnpm db:lint                    # local SQL analysis
pnpm db:test                    # local database tests
pnpm db:test:concurrency         # separate-transaction final-seat/capacity checks
pnpm test:integration           # opt-in; see backend/README.md
pnpm db:stop
```

For UI development, keep Supabase running, start `pnpm dev:backend` in one terminal and
`pnpm dev` in another. Vite proxies `/api` to Fastify in dev and preview. Optional
`frontend/.env` settings are documented in `frontend/.env.example`. Set
`VITE_SUPABASE_URL=http://127.0.0.1:55321` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the
local public key. Never copy a secret/service-role key into a browser environment.
Cover uploads also require local Storage (included by `pnpm db:start`) and the additive
cover migration. Run `pnpm covers:setup` once, then restart Fastify. The server-only
`EVENT_COVER_OPERATION_KEY` stays in ignored backend configuration; it is never a Vite
variable. Setup stores only its hash in PostgreSQL and refuses implicit rotation. See
[cover setup](docs/event-covers.md) for cleanup/recovery and existing-stack startup details.
Open `http://localhost:5173/register`; local confirmation/reset emails appear at
`http://127.0.0.1:55324`. Follow email links in the same browser/origin that requested them
because PKCE uses a locally retained verifier. Exact local redirect URLs are allowlisted
in `supabase/config.toml`. See [authentication](docs/authentication.md) and
[location UI setup](docs/location-ui.md).

`pnpm db:reset` explicitly resets **only the local** database, reapplies migrations and
loads development seeds. It destroys local data. Do not run it against a hosted project.
Neither backend startup nor frontend startup automatically initializes a database.
The countries seed contains ME, RS, BA and HR; its small city list is development-only.
Apply pending local migrations without a reset using `pnpm exec supabase db push --local`.
Populate broader source coverage explicitly with the geographic importer; neither seed nor
import claims perfect geographic completeness. Docker/Supabase must be available for live database
checks. See [backend/README.md](backend/README.md) for exact environment and test commands.

```bash
# Set the maintenance-only local GEOGRAPHY_DATABASE_URL in ignored backend/.env first.
pnpm geography:import --directory .tmp/geonames --download --dry-run
pnpm geography:import --directory .tmp/geonames
```

Importer paths are relative to `backend/`. Inputs/checksums and per-country outcomes are
reported; reruns preserve source-backed city IDs and application references. Downloads are
ignored and no importer runs automatically during application startup.

For submission checks, run typecheck, lint, build, `pnpm test:mock`, and `pnpm test:backend`.
Run local SQL/integration checks when Docker/Supabase are available and report any skipped
checks explicitly. The mock suite
covers entity references, validation, authorization, private access, capacity, concurrent
joins, response isolation, and demo sessions. Preview the production build, then review
home, discovery, details, login, and create/edit at 375px and 1440px. Keep creation/editing
demo journeys within one page runtime: reloading restores numeric fixtures. Real event
reads and writes use persistent PostgreSQL data. For real event browser checks, configure local Auth,
start the API/frontend, set `RUN_LOCAL_EVENT_READ_UI=true` and run
`pnpm --filter frontend exec playwright test tests/events-read-ui.spec.mjs`. It creates
isolated confirmed accounts/events through the local API and cleans them afterward, without
resetting existing data. Traces are disabled to keep session credentials out of artifacts.
For the real multi-user action workflow, set `RUN_LOCAL_EVENT_ACTIONS_UI=true` and run
`pnpm --filter frontend exec playwright test tests/event-actions-ui.spec.mjs`. The main
journey runs at 375px/1440px in light/dark; focused conflict/privacy cases run once.
For persistent image workflows, set `RUN_LOCAL_EVENT_COVERS_UI=true` and run
`pnpm --filter frontend exec playwright test tests/event-covers-ui.spec.mjs`.
See [the final frontend review](docs/frontend-review.md) for executed checks and limitations.

## Architecture and scope

React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui + React Router + TanStack Query.

```text
AGENTS.md                    Codex entry point referencing shared rules
CLAUDE.md                    Claude Code monorepo instructions
SPEC.md                      Shared product scope and acceptance criteria
frontend/
  CLAUDE.md                  Frontend architecture and rules
  DESIGN.md                  Visual identity and token meanings
  src/app/                   Providers, router, route composition
  src/features/users/        Real Auth, UUID profile/experience APIs/forms, separate numeric demo session
  src/features/games/        Real read-only profile game catalog plus unchanged event catalog mocks
  src/features/events/       Real read/write DTOs/clients/hooks, shared forms/views, isolated numeric demos
  src/features/geography/    HTTP geography API/hooks and reusable country/city controls
  src/components/ui/         Starter shadcn primitives
  src/components/layout/     Navigation and app layout
  src/lib/                   Mock helpers, reference IDs, utilities
backend/                     Fastify geography/Auth/profile/event API, repositories and tests
  scripts/geography/         Local GeoNames download/validation/import tooling
supabase/                    Local CLI config, SQL migrations, development seed and DB tests
docs/entities.md             Frontend mock contracts and implemented backend API boundary
docs/backend-architecture.md Data access, authorization and service architecture
docs/database-schema.md      Relational model, privacy, constraints and ER diagram
docs/backend-roadmap.md      Milestone boundaries and future integration
docs/events-api.md           Persistent backend event contracts and privacy model
docs/events-api-verification.md Executed Milestone 4A checks and remaining boundaries
docs/attendance-verification.md Executed Milestone 4B lifecycle, privacy and concurrency checks
docs/event-frontend-verification.md Executed 4C-1 read/cache/browser checks and 4C-2 boundary
docs/event-actions-verification.md Executed 4C-2 write/cache/multi-user browser checks
docs/event-covers.md          Private Storage, image API, setup and lifecycle recovery
docs/event-cover-verification.md Executed 4D file/RLS/browser checks and limits
docs/geographic-import.md    GeoNames scope, attribution, safe reruns and search behavior
.claude/                     Preserved rules, commands, design skill, reviewer, format hook
```

Features never import each other, including types. Routes compose them, and shared code
never imports features or app code. `pnpm lint` enforces these boundaries. Components use
TanStack Query hooks; feature APIs own data access. Each feature stores its own mock records.
Shared reference IDs validate mock relationships without cross-feature imports. Geography
and events share only the `src/lib/location.ts` selection-reference contract; routes compose
their controls rather than introducing feature imports.

Real event reads validate backend UUID DTOs; public cards use structured game/location/count
fields and only authorized details include addresses. Detail caches include the verified viewer,
are destroyed on account changes/logout, and reject late responses after identity changes.
Discovery uses public cursor pages. Category filtering applies to loaded pages, with Load More
available until exhaustion; the displayed number is loaded matches, not the total event count.
Mutation hooks capture the acting UUID/session, abort on account changes, cancel stale detail
reads and invalidate public lists/homepage. Successful writes use validated server responses;
there are no optimistic attendance changes. Leave removes participant-only addresses immediately
and private departure returns to discovery. Tokens never enter URLs, query keys or logs.

Mock writes take an explicit numeric `{ userId }` actor and simulate event permissions.
They are separate from real Supabase UUID identity. Demo data lives in memory and refresh
resets changes. To demonstrate legacy event writes, explicitly set
`VITE_ENABLE_DEMO_MODE=true`, restart Vite and use `/demo/login` and `/demo/events`.
Its selected profile ID stays in sessionStorage for the tab; production builds disable
selection even if the flag is set. A real Auth session does not supply a mock actor.
Public browsing/geography works independently. Payments, messaging, maps and waitlists
are not implemented.
See `docs/entities.md` for exact contracts and error behavior.

Routes: `/`, `/events`, `/events/:eventId`, `/events/new`, `/events/:eventId/edit`, `/login`,
`/register`, `/forgot-password`, `/reset-password`, `/auth/callback`, the development-only
`/demo/login`, and a not-found fallback. The homepage includes search, categories, and upcoming events.
Search/category links filter the upcoming public event list through URL parameters. Search
matches event titles; country/city, game, and open-seat controls combine with it and can be reset.
Event details show the host, game, schedule, tags, minimum age, visibility, and
capacity and viewer-specific host/participant state. Real accounts can create at `/events/new`;
only the verified host can edit or confirm deletion. Eligible visitors can join/leave;
anonymous participation links to login with a return destination. Full/closed events and
private outsiders cannot join. No UUID event is passed to a numeric fixture API.

### Isolated development demo

Only explicit development demo players can use `/demo/events/new` and
`/demo/events/:eventId/edit`. They retain the shared React Hook Form/Zod form, covers,
inline errors, mock join/leave and numeric host authorization. Demo details and success/
cancel/edit navigation stay under `/demo/events/*`. No such routes exist in production.
The following cover/fixture behavior describes this historical demo, not persistent event storage.

The location picker requires a backend suggestion before submission and retains its real
integer city ID plus display labels. Legacy fixtures keep city strings and a known ME
country, with no invented IDs. Venue is optional. Exact addresses are displayed only to
the host/current participants; mock data is still client-side, so this is not real security.

Create/edit supports optional JPG, PNG, or WebP covers up to 3 MiB (shown as 3 MB in the UI).
The browser resizes them to a maximum 1600px edge and passes a bounded data URL through
the existing mock image field; cards/details render the result. Replace or remove a custom
cover in the form, or keep the game-based default. Custom covers survive game changes and
reset with event data on reload. Nothing is uploaded externally or stored in browser storage;
Supabase Storage is planned for later backend uploads; no bucket or upload integration
is implemented through Milestone 2B.

Tags use eight predefined options, with at most six selections and removable chips. The
experience level controls Beginner friendly/Veterans only compatibility. The navbar theme
toggle saves dark/light preference in localStorage (`rollcall.theme`); dark is the default,
and unavailable storage still permits switching for the current page runtime.

Private events are hidden from discovery and readable only by the host and current participants.
Unlisted events remain accessible by link. Private events do not accept new players; no
invitation workflow is implemented. These are mock access checks, not real authentication.

Ten fictional Montenegro events cover Podgorica, Niksic, Budva, and other cities. Core dates
roll forward on reload; special canceled, past, and unlisted examples remain available by
direct link. Images are local SVG illustrations in `frontend/public/images/`, with no external
image service. Minimum age is displayed as guidance without verification. Event removal
exists in the mock API only; the MVP has no deletion UI. A newly created private event
is initially visible to its host only.

## Backend boundary and security

Implemented routes are `GET /health`, `GET /api/countries`,
`GET /api/cities?country=ME&q=pod&limit=4`, and authenticated `GET /api/me`.
The last returns only `{ id: UUID, email: string | null }` with `Cache-Control: no-store`;
invalid/missing/expired bearer tokens return 401. Health is a process liveness check; it does not
prove database readiness. Geography is read through Supabase's Data API using an
unprivileged key, explicit grants and RLS. No service-role key or database password is
needed by the API. Never put privileged credentials in a frontend environment file.
The separate local importer uses a maintenance-only PostgreSQL connection and never runs
inside a request. Its privileges are not added to the runtime Supabase client.

Registration initializes a minimal profile with its actual Auth UUID and a fixed
`RollCall player` placeholder; no email/roles are copied from editable metadata.
The schema includes UUID profiles linked to Supabase Auth and UUID events, numeric
geography/game IDs, country/city relationships, per-game experience and unique attendance.
Exact addresses, private self-declared age information and roles are separated from
public-safe records. Profile/game/experience tables now have focused public-read and
owner-write grants/RLS. Events, roles and protected event locations remain denied.
The numeric frontend demo IDs are unchanged and are not real account identities.
The city endpoint searches canonical/alternate names with exact/prefix priority, substring
fallback for three or more characters and four prominent suggestions by default. Existing
DTO fields remain; country and administrative codes are additive.

No hosted Supabase project is created, linked, migrated, reset or deployed by these
commands. Real profiles/per-game experience are implemented in Milestone 3B; persistent
UUID event/attendance integration is Milestone 4. Invitation codes, role administration,
Storage policies/uploads require later work. Frontend
country/city autocomplete reads the existing geography API in Milestone 2B.

## Team workflow: Codex and Claude Code

All code, identifiers, comments, commit messages, docs, and UI copy are in English.
You can talk to either assistant in any language.

1. Read `SPEC.md`, `docs/entities.md`, and the relevant instructions. Codex starts at
   `AGENTS.md`; Claude Code at `CLAUDE.md` and `frontend/CLAUDE.md`. Both follow the
   existing `.claude/rules/` and `frontend/DESIGN.md`.
2. Agree on task ownership and show a plan before edits. Use a separate feature branch per
   task/person (for example `feat/event-filters` or `feat/event-form`), based on current `main`.
   Coordinate shared contract, router, token, and lockfile changes before parallel work.
3. Keep PRs focused. Update entity contracts with types/APIs and the spec with scope changes.
   Preserve teammates' changes and `.claude/`. Never commit secrets or environment files.
4. Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:mock`, and relevant backend
   tests. For SQL changes, run local migrations, database lint/tests and integration tests
   when available; distinguish executed tests from static review. For UI, inspect at 375 px and 1440 px,
   compare with DESIGN.md, and check console errors. Report unavailable checks.
5. Obtain explicit approval before committing or pushing. Open a GitHub PR explaining the
   problem, resulting behavior, validation, and limitations. Have the teammate review;
   merge only with approval, then update local `main` before starting the next branch.

Claude Code retains `/new-feature`, `/new-page`, `/check`, the `design-system` skill,
`ui-reviewer`, and formatting hook. Generic feature templates now use events as their
reference; users/games intentionally expose only reads. Codex performs equivalent checks
with available tools; Claude hooks do not automatically run for Codex edits.
`.mcp.json` retains Playwright, shadcn, and Context7; these depend on each developer's tool
configuration, not the running app. MCP servers use `npx` as in the starter.
