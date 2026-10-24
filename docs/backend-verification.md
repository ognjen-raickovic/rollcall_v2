# Backend Milestone 1 verification

Executed on 24 October 2026 on `feat/backend-foundation`, Windows, Node.js 22.19.0,
pnpm 12.14.0, Supabase CLI 2.122.0 and Docker 29.1.2. No remote project was linked,
created, modified or deployed. No commit, push or merge was performed.

## Checks actually executed

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed, including esbuild's explicitly permitted installation check |
| `pnpm typecheck` | Frontend and backend passed, including backend test types |
| `pnpm lint` | Both packages passed; frontend boundaries passed |
| `pnpm build` | Frontend production bundle and backend ESM output passed |
| `pnpm test:mock` | All 11 existing frontend mock checks passed |
| `pnpm test:backend` | All 9 backend checks passed |
| Local Supabase initialization | Both migrations and development seed executed successfully |
| `pnpm db:reset` | Clean local reset reapplied both migrations and seed successfully |
| `pnpm db:lint` | No schema errors or warnings |
| `pnpm db:test` | All 59 pgTAP assertions passed after the clean reset |
| `pnpm db:test:concurrency` | Both separate-transaction races passed after the clean reset |
| `pnpm test:integration`, with `RUN_LOCAL_INTEGRATION=true` | Passed against actual local Supabase after the clean reset; not skipped |
| Compiled API via `pnpm --filter backend start` | Started successfully; real HTTP health, countries, city search and validation checked |
| Frontend browser smoke | Passed at 375px and 1440px, both themes, with no console errors |
| `git diff --check` | Passed |

Root commands use `pnpm.cmd` on this PowerShell installation. Scripts and environment
instructions are in [backend/README.md](../backend/README.md).

## Database coverage

Executed migrations:

- `supabase/migrations/20261024000100_initial_schema.sql`
- `supabase/migrations/20261024000200_geography_search.sql`

The tests exercise table existence, RLS and explicit privileges, disabled-country isolation,
literal wildcard handling, case/diacritic normalization, bounded search, UUID Auth foreign
keys, matching profile country/city, private age/address/role boundaries, required private
addresses, immutable hosts, per-game experience, tags, schedules, price precision, host
exclusion, unique attendance, idempotent conflict handling, capacity and cascade deletion.

Concurrency tests use independent PostgreSQL connections. They confirm that the second
writer is waiting on a database lock before releasing the first transaction, then verify
safe rejection and consistent attendance counts. Scenarios cover two users competing for
the last seat and a host reducing capacity while another player joins. Generated fixtures
are cleaned up. These are database invariants, not an implemented join HTTP endpoint.

The migrations/seeds also executed on an isolated, network-disabled vanilla PostgreSQL 17
container with minimal Auth/role test stubs. The actual Supabase runs above are the stronger
compatibility checks; that temporary container was removed after testing.

## API coverage

Fastify injection and repository tests cover strict/duplicate query validation, country
normalization, empty/unknown results, configurable limits, consistent errors, safe DTO
mapping, upstream/network failure and a bounded timeout without SDK retries multiplying it.

The live integration suite checks all four seeded countries, country-scoped searches and
`Niksic`/`Cacak`/accented input, literal wildcard input, limits, and Data API least privilege.
It first proves that the same credentials can read countries before asserting event reads
are denied. The suite rejects non-loopback Supabase URLs.

Real HTTP requests to the compiled server returned:

- `GET /health`: 200 with process liveness.
- `GET /api/countries`: 200 with BA, HR, ME and RS.
- `GET /api/cities?country=RS&q=Cacak`: 200 containing `Čačak`.
- `GET /api/cities?country=ME&limit=21`: 400 with `fields.limit`.

## Frontend preservation

No React source, routing, design tokens, assets or frontend package manifest changed.
Only `frontend/CLAUDE.md` received a scope clarification. The workspace lockfile includes
the backend dependencies and resulting optional peer-resolution changes.

Installed headless Chrome through CDP was used because Playwright tooling was unavailable.
At each width, home, discovery, details and login loaded without horizontal overflow.
An anonymous visit to create redirected to login; demo login returned to create; the host
editor prefilled its existing event; joining and leaving another event both worked.
Dark/light discovery screenshots and loaded cards were visually inspected. Browser console
error collections were empty. Local screenshots remain in ignored `backend/.tmp/`.

## Environment and limitations

Docker Desktop was installed but stopped; it was started for local testing. The first
full-stack image download failed with registry TLS/DNS errors. A minimal stack then ran
successfully, excluding Studio, Storage, local mail and postgres-meta. Those optional
services, real Auth flows and uploads were not tested. Configurations for local Auth and
Storage are foundations only; no app authentication or storage bucket was implemented.

Windows reserves ports `54286–54385` here, preventing the default Supabase ports from
binding. Repository configuration uses API `55321`, database `55322`, shadow database
`55320`, Studio `55323` and mail UI `55324` instead.

An ignored `backend/.env` was configured with the local URL and unprivileged publishable
key. No hosted credentials, service-role client or database password is needed by Fastify.
Supabase startup/status can print local credentials; generated startup logs were removed
and should not be published. The local Supabase stack is initialized for further work.

Non-geography application tables deliberately have no Data API client grants. Real
authentication, event/profile APIs, frontend/backend integration, invitation codes,
administration and Storage workflows remain future milestones. The 13 seeded cities are
development examples, not a complete geographic dataset. Comprehensive attributed import
and country/city autocomplete are the next milestone.
