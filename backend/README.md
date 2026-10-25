# RollCall backend: geography, authentication, profiles and events

Fastify REST API with TypeScript and Zod, backed by local Supabase PostgreSQL through
Supabase's Data API. Health, countries, city search and authenticated `GET /api/me` are
implemented. Milestone 3B adds owner-editable UUID profiles, private birth year, public-safe
profiles and per-game experience, plus the real read-only game catalog. React uses Fastify
and Supabase Auth. Milestone 4A adds persistent event discovery/details and host-only CRUD.
React event CRUD/attendance and numeric demo catalogs remain mocked until 4C. Real attendance,
Storage uploads and private codes remain deferred. See [profiles](../docs/profiles.md) and
[event contracts/setup](../docs/events-api.md).

## Prerequisites

- Node.js 22.12+ or a newer supported LTS.
- pnpm 12.14.0, pinned by the root package.
- Docker Desktop/container runtime running for local Supabase. The CLI is a pinned root
  development dependency; no global Supabase install or hosted project is required.

Use commands from the repository root, with `pnpm.cmd` on PowerShell when necessary.

## Start locally

```bash
pnpm install
pnpm db:start
pnpm exec supabase status
```

Copy `backend/.env.example` to `backend/.env`, then configure `SUPABASE_URL` with the
local API URL and `SUPABASE_PUBLISHABLE_KEY` with the local publishable/legacy anon key
shown by the CLI. Do not copy its secret/service-role key. Treat all CLI status output as
configuration material and do not paste it into public issues, screenshots or commits.

```bash
pnpm dev:backend
# Separate terminal; configure frontend/.env from its example for real Auth:
pnpm dev
```

The API defaults to `http://127.0.0.1:3001`. `db:start` starts only local containers and
applies migrations/seeds when initializing a fresh stack. If a previously initialized
local database needs rebuilding, `pnpm db:reset` explicitly resets only the local
database, destroys local data and reapplies migrations plus development seed. Never run
an unqualified reset or a linked/remote migration command as part of this setup.
For normal upgrades, apply pending migrations with `pnpm exec supabase db push --local`
without resetting data. Inspect what must be preserved before any destructive local reset.

Stop the API with Ctrl+C. Stop local Supabase with `pnpm db:stop`.

Local ports are API `55321`, PostgreSQL `55322`, Studio `55323`, mail UI `55324`, and
shadow database `55320`. They avoid a Windows-reserved range encountered during setup;
read `supabase/config.toml` and CLI status rather than assuming Supabase's default ports.

## Environment

| Variable                    | Meaning                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | Required local Supabase API URL, `http://127.0.0.1:55321` in this repository              |
| `SUPABASE_PUBLISHABLE_KEY`  | Required unprivileged publishable key or local legacy anon key; never secret/service-role |
| `NODE_ENV`                  | `development`, `test`, or `production`; default `development`                             |
| `HOST`                      | Listening host; default `127.0.0.1`                                                       |
| `PORT`                      | Listening port; default `3001`                                                            |
| `LOG_LEVEL`                 | Structured logger verbosity; default `info`                                               |
| `SUPABASE_TIMEOUT_MS`       | Bound on database/Data API requests; default `5000`                                       |
| `CITY_SEARCH_DEFAULT_LIMIT` | Suggestions when no limit is supplied; default `4`                                        |
| `CITY_SEARCH_MAX_LIMIT`     | Configurable result ceiling, hard-bounded at `20`; default `20`                           |

Environment is validated before listening. The runtime API needs no database password,
service-role key or management access token. `.env` is ignored. The browser uses
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Auth only; use the same local
project's public URL/key, never privileged credentials. Geography and `/api/me` go through
Fastify using the Vite proxy; application tables are not queried by browser Auth code.
See [authentication setup](../docs/authentication.md) and
[location UI setup](../docs/location-ui.md) for frontend origin configuration.

The separate importer uses `GEOGRAPHY_DATABASE_URL` in ignored `backend/.env`, containing
the local PostgreSQL connection string. It rejects non-loopback hosts and is never called
by the API. See [geographic import](../docs/geographic-import.md) for setup and safety rules;
do not reuse maintenance privileges for ordinary HTTP requests.

## Implemented HTTP API

Successful reads return JSON directly without an envelope. No authentication is required
for these public geography endpoints.

| Method/path                                      | Behavior                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `GET /health`                                    | `{ "status": "ok", "service": "rollcall-api" }`; 200 without a database probe                   |
| `GET /api/countries`                             | Enabled countries as `{ id, isoCode, name }[]`                                                  |
| `GET /api/cities?country=ME&q=pod&limit=4`       | Selected-country place suggestions as city DTO array                                            |
| `GET /api/me`                                    | Verified bearer identity as `{ id: UUID, email: string \| null }`; authenticated only, no-store |
| `GET` / `PATCH /api/me/profile`                  | Read/update the verified account's profile and optional private birth year                      |
| `GET /api/me/game-experience`                    | Read the verified account's selected games/levels                                               |
| `PUT` / `DELETE /api/me/game-experience/:gameId` | Owner-only experience upsert/removal                                                            |
| `GET /api/users/:userId`                         | Public-safe UUID profile, excluding email/age/roles                                             |
| `GET /api/games`                                 | Real read-only database game catalog                                                            |
| `GET /api/events`                               | Public scheduled discovery; bounded cursor page of safe summaries                               |
| `GET /api/events/:eventId`                      | Public/unlisted details or host-only private details; address only for the host                  |
| `POST /api/events`                             | Verified account creates UUID event plus protected address; 201 host DTO                         |
| `PATCH /api/events/:eventId`                    | Host-only atomic update; preserve identity and attendance                                       |
| `DELETE /api/events/:eventId`                   | Host-only hard delete; cascades location/memberships; 204                                         |

City DTO:

```json
{
  "id": 1,
  "countryId": 1,
  "name": "Podgorica",
  "countryIsoCode": "ME",
  "countryName": "Montenegro",
  "administrativeDivision": null,
  "admin1Code": null,
  "admin2Code": null,
  "latitude": null,
  "longitude": null
}
```

The example shows shape only; callers must use actual returned IDs and must not depend
on a hardcoded ID for a place. Latitude/longitude/administrative division may be null.
No private profile/event information is included in geography responses.

`country` is required, trimmed and uppercased, and must contain two ASCII letters.
`q` is optional, trimmed, and at most 80 characters; empty input requests suggestions.
Search uses canonical/source alternate names, tolerating case, accents and common Serbian
Latin/Cyrillic forms such as `Cacak` → `Čačak`. Exact matches rank ahead of prefixes,
then substrings for at least three normalized characters; shorter queries use prefixes only.
A supplied `limit` must be an integer in the configured range
`1..CITY_SEARCH_MAX_LIMIT`; the default is `CITY_SEARCH_DEFAULT_LIMIT`. SQL also caps
results at 20. Unknown query keys or repeated/invalid values fail validation rather than
silently broadening a query. Unsupported/unknown/disabled countries and unmatched names return
`[]`; search is currently restricted to enabled ME/RS/BA/HR. Results are deduplicated by city
ID. Population descending (unknown last), normalized name and ID break ties within each
match rank. Empty input uses prominence ordering. The hand-curated development seed does
not invent population data; the explicit import supplies available source population.

Errors use the shared contract:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "The request is invalid.",
  "fields": { "country": ["Choose a two-letter country code."] }
}
```

Messages are illustrative; rely on status/code/field keys. Invalid requests return 400,
unmatched routes 404, database/Data API failures 503 (`DEPENDENCY_UNAVAILABLE`), and
unexpected failures 500. Raw upstream details are never returned. Health success alone
does not imply the configured database is available; verify a geography endpoint too.

`/api/me` uses the reusable authentication guard: Supabase verifies the token signature
with `getClaims` (JWKS for asymmetric keys, Auth verification for symmetric local keys),
and the server checks configured issuer, authenticated audience, expiry and UUID subject.
Missing, malformed, invalid and expired tokens return 401 `UNAUTHENTICATED`. UUID/email
identity is request-local; user-controlled actor IDs and metadata grant no permissions.
Geography endpoints remain anonymous. Profile writes use focused owner grants/RLS; raw event
tables stay closed and event endpoints call checked RPCs. Logout revokes refresh capability;
already-issued access JWTs remain valid until
expiry, so local UI logout is not an instantaneous server-side JWT revocation mechanism.

Local email confirmation is enabled. The email UI is `http://127.0.0.1:55324`; registration
and recovery links use the exact loopback callback/reset allowlist in `supabase/config.toml`.
Open links in the initiating browser/origin for PKCE. Apply pending migrations with
`pnpm exec supabase db push --local`; do not reset the populated place database.

## Development dataset

The four country rows are Montenegro (ME), Serbia (RS), Bosnia and Herzegovina (BA),
and Croatia (HR). The development seed contains only these real places:

- ME: Podgorica, Nikšić, Budva, Bar.
- RS: Beograd, Novi Sad, Čačak.
- BA: Sarajevo, Banja Luka, Mostar.
- HR: Zagreb, Split, Rijeka.

This is a small, manually curated development dataset, not a GeoNames import or a complete
city directory. No population, coordinates or source IDs are fabricated. Resetting a local
database restores this sample rather than downloading the full geographic dataset.

## Geographic import: Milestone 2A

The actual four-country import contains 46,241 GeoNames places. Counts, preserved legacy
ambiguities and checksums are in [geographic import](../docs/geographic-import.md) and
[verification](../docs/geographic-verification.md).

Set `GEOGRAPHY_DATABASE_URL` in ignored `backend/.env`, then run from the repository root:

```bash
pnpm geography:import --directory .tmp/geonames --download --dry-run
pnpm geography:import --directory .tmp/geonames
pnpm geography:benchmark
```

The package executes in `backend/`, so paths are relative to that directory. Local country
text/ZIP inputs also work without downloading. `--download` fills missing archives;
`--download --refresh` explicitly chooses newer archives. Each country imports transactionally
by stable source identity and preserves existing internal IDs/references. Ambiguous seed
matches are reported rather than merged. No city is deleted when a newer extract omits it.

Read [geographic import](../docs/geographic-import.md) for the exact feature-code allowlist,
offline/refresh/report flags, SHA-256 provenance, CC BY 4.0 attribution, source limitations,
search ranking and Milestone 2B frontend requirements. A dry-run is not an executed import;
record actual per-country counts and rerun results when verifying a dataset.

## Checks

See [Milestone 1 verification](../docs/backend-verification.md) for the commands actually
executed, database assertion counts, browser checks and local environment limitations.

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test:backend
pnpm test:mock
pnpm db:lint
pnpm db:test
pnpm db:test:concurrency
```

Typecheck/lint/build cover both packages. `test:backend` runs automated backend tests
without requiring a live database. SQL lint/tests require a running local Supabase stack.
`db:test:concurrency` uses separate local PostgreSQL transactions through Docker to test
competing final-seat joins and attendance/capacity edits; it never targets a hosted project.
Database-backed integration tests are opt-in and reject non-loopback Supabase targets.
With the local stack running and `backend/.env` configured (including
`GEOGRAPHY_DATABASE_URL` for the maintenance tests), run:

```bash
RUN_LOCAL_INTEGRATION=true pnpm test:integration
```

For Milestone 4A, run focused auth/profile/geography/event integrations without the separate
importer fixture suite (no geographic import or reset is required):

```powershell
$env:RUN_LOCAL_INTEGRATION = 'true'
pnpm.cmd --filter backend exec node --env-file-if-exists=.env --import tsx --test tests/integration/events.test.ts tests/integration/auth.test.ts tests/integration/profiles.test.ts tests/integration/geography.test.ts
Remove-Item Env:RUN_LOCAL_INTEGRATION
```

The event test starts a real loopback HTTP listener, registers/confirms isolated local accounts,
checks lifecycle/persistence/visibility and direct Data API restrictions, then removes its own
fixtures. SQL tests roll back. See [Milestone 4A verification](../docs/events-api-verification.md).

PowerShell:

```powershell
$env:RUN_LOCAL_INTEGRATION = 'true'
pnpm.cmd test:integration
Remove-Item Env:RUN_LOCAL_INTEGRATION
```

Without the opt-in the suite reports a skip. A skipped integration suite is not a pass
against PostgreSQL. Tests exercise the real repository and anonymous permission checks.
Importer tests create, migrate and remove a randomly named disposable local database;
the local maintenance account needs permission to create databases. They never reset the
application database. Imported-place coverage skips explicitly until the geographic import
has run. Record executed checks in the milestone handoff.

Build output is `backend/dist`; `pnpm --filter backend start` runs the compiled API.
Run `pnpm build` first. No script deploys or modifies a remote project.

## Safety and later milestones

The Supabase clients use unprivileged keys and focused geography/profile grants/RLS plus
checked event RPCs backed by a non-bypass executor and host policies.
Real login, verified identity, profiles and per-game experience are implemented. Each
authenticated operation uses a fresh bearer-scoped client; public catalog calls remain
anonymous. No service-role repository, real attendance endpoint, storage bucket/upload, invitation
interface or admin dashboard is implemented.
Server-side authorization and tests must accompany each
future grant/API. Roles cannot be assigned through client input.

See [architecture](../docs/backend-architecture.md), [schema](../docs/database-schema.md),
[entity contracts](../docs/entities.md) and [roadmap](../docs/backend-roadmap.md). Official
setup references: [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
and [local migrations](https://supabase.com/docs/guides/local-development/overview).
