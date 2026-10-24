# RollCall backend: Milestone 1

Fastify REST API with TypeScript and Zod, backed by local Supabase PostgreSQL through
Supabase's Data API. Only health, countries and city search are implemented. The React
app remains independent and continues to use its existing mock APIs/demo login.

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
# Separate terminal, optional; the frontend still runs on mocks:
pnpm dev
```

The API defaults to `http://127.0.0.1:3001`. `db:start` starts only local containers and
applies migrations/seeds when initializing a fresh stack. If a previously initialized
local database needs rebuilding, `pnpm db:reset` explicitly resets only the local
database, destroys local data and reapplies migrations plus development seed. Never run
an unqualified reset or a linked/remote migration command as part of this setup.

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

Environment is validated before listening. The backend needs no database password,
service-role key or Supabase access token. `.env` is ignored. The browser needs no
Supabase environment variables in this milestone. Changing server configuration does
not connect the existing frontend to the backend.

## Implemented HTTP API

Successful reads return JSON directly without an envelope. No authentication is required
for these public geography endpoints.

| Method/path                                | Behavior                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `GET /health`                              | `{ "status": "ok", "service": "rollcall-api" }`; 200 without a database probe |
| `GET /api/countries`                       | Enabled countries as `{ id, isoCode, name }[]`                                |
| `GET /api/cities?country=ME&q=pod&limit=4` | Selected-country place suggestions as city DTO array                          |

City DTO:

```json
{
  "id": 1,
  "countryId": 1,
  "name": "Podgorica",
  "administrativeDivision": null,
  "latitude": null,
  "longitude": null
}
```

The example shows shape only; callers must use actual returned IDs and must not depend
on a hardcoded ID for a place. Latitude/longitude/administrative division may be null.
No private profile/event information is included in geography responses.

`country` is required, trimmed and uppercased, and must contain two ASCII letters.
`q` is optional, trimmed, and at most 80 characters; empty input requests suggestions.
Search is a database-normalized prefix match, tolerating case and diacritics such as
`Cacak` → `Čačak`. A supplied `limit` must be an integer in the configured range
`1..CITY_SEARCH_MAX_LIMIT`; the default is `CITY_SEARCH_DEFAULT_LIMIT`. SQL also caps
results at 20. Unknown query keys or repeated/invalid values fail validation rather than
silently broadening a query. Unknown/disabled countries and unmatched names return `[]`.
Results order by population descending (unknown last), then normalized name and ID; the hand-curated
development seed does not invent population data.

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

## Development dataset

The four country rows are Montenegro (ME), Serbia (RS), Bosnia and Herzegovina (BA),
and Croatia (HR). The development seed contains only these real places:

- ME: Podgorica, Nikšić, Budva, Bar.
- RS: Beograd, Novi Sad, Čačak.
- BA: Sarajevo, Banja Luka, Mostar.
- HR: Zagreb, Split, Rijeka.

This is a small, manually curated development dataset, not a GeoNames import or a complete
city directory. No population, coordinates or source IDs are fabricated. Milestone 2 will
add a reproducible, attributed comprehensive import and frontend autocomplete.

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
With the local stack running and `backend/.env` configured, run:

```bash
RUN_LOCAL_INTEGRATION=true pnpm test:integration
```

PowerShell:

```powershell
$env:RUN_LOCAL_INTEGRATION = 'true'
pnpm.cmd test:integration
Remove-Item Env:RUN_LOCAL_INTEGRATION
```

Without the opt-in the suite reports a skip. A skipped integration suite is not a pass
against PostgreSQL. The test reads real local seed data through the actual repository
and checks that direct anonymous event reads are denied. Record the commands actually
executed in the milestone handoff.

Build output is `backend/dist`; `pnpm --filter backend start` runs the compiled API.
Run `pnpm build` first. No script deploys or modifies a remote project.

## Safety and later milestones

The Supabase client uses only unprivileged geography grants/RLS. All non-geography tables
have RLS and remain inaccessible to Data API client roles in Milestone 1. No service-role
repository, real login, event write route, storage bucket/upload, invitation interface or
admin dashboard is implemented. Server-side authorization and tests must accompany each
future grant/API. Roles cannot be assigned through client input.

See [architecture](../docs/backend-architecture.md), [schema](../docs/database-schema.md),
[entity contracts](../docs/entities.md) and [roadmap](../docs/backend-roadmap.md). Official
setup references: [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
and [local migrations](https://supabase.com/docs/guides/local-development/overview).
