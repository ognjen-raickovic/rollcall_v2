# Milestone 4A verification

Verified locally on 25 October 2026 on `feat/persistent-events-api`. The existing local
Supabase PostgreSQL/Auth/mail stack was reused. No branch switch, staging, commit, push,
merge, deployment, remote Supabase change, database reset or GeoNames import was performed.
No credentials or authentication tokens were printed in diagnostics.

## Implemented files and contracts

`backend/src/modules/events/` contains routes, Zod input/DTO validation, types, curated
tag rules, precise cursor encoding and a checked-RPC repository. `backend/src/app.ts`
registers it and constructs isolated unprivileged bearer-scoped clients; the narrow database
types describe its five RPCs. No package, lockfile, environment or frontend runtime changes
were needed. The existing geography missing-route assertion now uses a genuinely absent URL.

Endpoints are `GET /api/events`, `GET /api/events/:eventId`, `POST /api/events`,
`PATCH /api/events/:eventId` and `DELETE /api/events/:eventId`. See
[full contracts](events-api.md) for field bounds/defaults, literal search, supported-country
filters, scheduled/public discovery, chronological keyset pages and merged validation.
Public summaries/details omit protected addresses and account-private fields; only verified
hosts receive address-bearing details. Private and missing events share the same HTTP 404.
Participant records, sharing flags and administrator roles grant no additional access in 4A.

Two new additive migrations were actually applied locally:

- `20261025000200_events_api.sql`: title-search index, non-bypass executor role, focused
  grants/RLS, private validation/DTO/checked entry functions and five public invoker wrappers.
- `20261025000300_event_executor_identity.sql`: narrowly scoped private Auth-subject resolver,
  corresponding function/policy references and STABLE conversion-helper declarations.

The argument-free subject resolver is migration-role-owned, reads no tables and is executable
only by the executor. Event data functions run as the separate NOLOGIN/NOBYPASSRLS executor,
with limited columns, owner policies, empty search paths and explicit ACLs. API roles cannot
assume that role or access raw event/location/attendance tables. No service-role runtime path
was introduced. Event/address writes are atomic; hard deletion cascades only related event
locations/memberships. Existing registration/profile/geography data structures are preserved.

Root/backend/frontend instructions, README, SPEC and entity/architecture/schema/roadmap docs
were updated to distinguish this backend from React's unchanged numeric event mocks.

## Executed checks

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Frontend and backend passed, including backend test types |
| `pnpm lint` | Both passed; frontend feature boundaries passed |
| `pnpm build` | Both production builds passed |
| `pnpm test:backend` | 30 tests passed, including six new event route/adapter/schema tests |
| Focused live event integration | Four scenarios plus parent passed (five Node test entries), using real loopback HTTP, Auth, PostgREST and PostgreSQL |
| Existing live Auth/profile/geography integrations | Four tests passed, including imported-place search; no importer rerun |
| `pnpm db:lint` | No schema errors/warnings |
| `pnpm db:test` | 217 assertions passed across five SQL files, including 56 event assertions |
| `pnpm db:test:concurrency` | Both final-seat and concurrent capacity-reduction scenarios passed |
| `pnpm test:mock` | 11 scenarios plus parent passed (12 entries), preserving CRUD/private access/join/leave/covers/tags/demo sessions |
| `pnpm test:geography` | Five client scenarios plus parent passed (six entries) |
| `pnpm test:profiles` | Two client scenarios plus parent passed (three entries) |
| `git diff --check` | Passed |

The live event suite registers and confirms three isolated real local accounts, starts Fastify
on a random loopback port, and exercises all five HTTP operations. It verifies actual reference
relationships across ME/RS/BA/HR, literal wildcard search, chronological order, microsecond
cursor pagination, invalid queries, defaults, malformed dates/capacity/references/tags and
host derivation despite submitted privileged metadata. It checks anonymous/non-host mutation
denials; private/missing equivalence; host-only exact addresses even for seeded participants,
a seeded superadmin and true sharing flags; safe visibility transitions; merged validation;
attendance preservation; capacity conflicts; and deletion of past/cancelled events with
location/membership cascades. A fresh Fastify instance reads the saved data back from PostgreSQL.

Direct PostgREST tests confirm closed tables, bounded RPCs, host enforcement and private
address redaction. Raw PostgREST `P0002` errors use HTTP 500; Fastify maps that database code
to its sanitized 404. SQL assertions separately test RLS/grants, helper ACLs, function owners,
search paths and resolver isolation. Unit tests verify dependency-error sanitization and
safe output projection independently of database behavior.

Tests clean up only their own generated accounts/events; SQL fixtures roll back. Final local
aggregate counts match the pre-work baseline: 46,243 cities, 23,401 aliases and eight games;
zero Auth users, profiles, events, protected locations or membership rows. Both event migration
versions are recorded as applied. The extra two local cities beyond the original 46,241
GeoNames import were retained. The pre-existing local stack was left running.

## Limits and next milestones

This is ready for Milestone 4A PR review, with local verification only. Hosted migration,
deployment, production load/abuse testing and large event-volume query benchmarks were not
performed. Cursor pagination is positional, not a snapshot across concurrent event edits.
Invalid SQL relationship/merged-state errors become a safe form-level validation message;
the API does not expose raw constraint details. Content edits require a future final start,
including address-only edits. Hard delete has no archive/audit/restore workflow.

No browser/UI suite was run because no frontend runtime, layout or styling changed; unrelated
browser suites were deliberately excluded. API-client/mock regressions and frontend static
checks/build passed. React still uses numeric event mocks and explicit development-only demo
actors; real UUID accounts do not inherit their permissions. Backend events start empty until
a real confirmed account creates them. Default local covers only are supported.

Milestone 4B must add verified-actor transactional join/leave and separately review participant
address/private-event eligibility and self-declared age/experience policy. It can reuse the
UUID event APIs, participant key, counter triggers and row-locking foundations, but must
extend grants/RLS/DTO and concurrent allow/deny tests. Frontend migration is 4C; Storage is
4D; private codes and role-authorized access are 5. None of those deferred APIs were added.
