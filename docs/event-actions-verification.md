# Milestone 4C-2: real event action implementation and verification

Verified locally on 25 October 2026 on `feat/event-actions-ui`. The React frontend now
uses the existing Fastify/PostgreSQL event writes. No backend code, migrations, grants,
RLS, dependencies or environment variables changed. No reset, geographic import, hosted
Supabase operation, branch change, commit, push, merge or deployment was performed.

## Connected workflows and files

| Action | Endpoint | Frontend behavior |
| --- | --- | --- |
| Create | `POST /api/events` | Real Auth required; validated 201 host details supply the UUID detail destination |
| Edit | `PATCH /api/events/:eventId` | UUID route, matching verified host and authorized details required; validated result refreshes details/discovery |
| Delete | `DELETE /api/events/:eventId` | Host-only accessible confirmation; 204 clears details and returns to discovery with feedback |
| Join | `POST /api/events/:eventId/attendees/me` | Real Auth required; acknowledged attendance is followed by an actual authorized detail read |
| Leave | `DELETE /api/events/:eventId/attendees/me` | Acknowledged counters replace participation state and revoke address access; private departure returns safely to discovery |

New event API modules: `event-write-dtos.ts`, `persistent-event-actions-api.ts`,
`use-persistent-event-actions.ts`, `persistent-event-form-values.ts` and `event-date-time.ts`.
`use-persistent-event-form.ts` owns the real form controller. `EventFormView` shares the
existing form presentation with the numeric demo; `PersistentEventEditor` and
`PersistentEventForm` provide the real controller. `DeleteEventDialog` uses a native modal
dialog with labels, initially focused Cancel, Escape dismissal and pending/error recovery.

Real create/edit route files compose users, games and geography through props/render slots.
Copied demo route controllers retain numeric CRUD under `/demo/events/*`; real UUIDs never
enter mock APIs. The obsolete pending-hosting route was removed. Event details, participation,
discovery notices, shared HTTP error handling, router and introductory copy were updated.
`test:event-actions` was added at workspace/frontend level. Existing read browser expectations
now recognize working actions and the real-login hosting guard. Shared instructions, scope,
README, API/entities, architecture, design and roadmap documentation were updated.

## Request mapping and validation

The shared form collects title, description, actual catalog game ID, country/city, optional
venue, private address, start/end, capacity, minimum-age guidance, experience, EUR price,
curated tags and visibility. Country and city display metadata remain local: writes send
only the confirmed `cityId`. Blank venue becomes null. Ownership and country derive on the
server. Strict schemas reject submitted actors, host IDs, counts, attendees, client event
IDs, image data URLs and arbitrary cover paths; the supported default cover marker is null.

Required fields, bounded integers/text/price, future starts, end ordering, curated compatible
tags, valid visibility, matching selected country/city and current known attendance are
validated. The backend validates authoritative references, ownership, final merged state and
current participation. HTTP 400/409 field errors map inline (`cityId` maps to location),
including concurrent capacity conflicts. Failed saves preserve drafts, repeated submission
is blocked, and refetches do not reset entered values. Location fields validate their
complete snapshot together so a confirmed suggestion clears stale mismatch feedback.

Picker values use the browser's local timezone and convert to ISO instants. Invalid dates
and skipped DST local times are rejected. Unchanged edit values preserve the original ISO
instant and precision, including microseconds and overlap offsets. A changed ambiguous
fall-back time follows JavaScript's local-time interpretation; there is no timezone chooser.

Real forms show standard category illustrations with an upload-deferral explanation and
no file input. Demo covers remain bounded, memory-only data URLs. No Storage uploads or
fake upload confirmations exist.

## Identity, cache and privacy

Requests use the route-composed verified Supabase session getter. Actors are captured per
mutation and checked before/after HTTP. Bearer tokens go only to the configured API origin;
paths/redirects are constrained. Tokens never appear in URLs, logs or query keys. Errors
retain safe status/code/field contracts; arbitrary dependency messages remain sanitized.

Public discovery/homepage keys (`persistent-events`) are separate from event/viewer detail
keys (`EVENT_DETAILS_QUERY_KEY`, event UUID, viewer UUID or null). Mutation hooks cancel old
detail reads before cache effects, recheck the actor after awaits, invalidate public scopes
and remove other viewer entries. Create/update store validated host DTOs. Join reads actual
authorized details rather than inventing an address from the attendance summary. Leave
replaces public/unlisted details with a validated address-free acknowledged DTO; private
leave removes details. Delete removes all detail entries for the UUID.

No optimistic writes are used. Failed ambiguous writes refetch server truth. Address display
is suppressed during leave and after a failed ambiguous leave until retry or page reload;
membership/counts never claim an unacknowledged success. Auth transitions clear protected
queries, abort pending requests and prevent old feedback/navigation/cache writes from
reaching the next account. Detail/form controllers remount by viewer; inactive mutation
retention is zero. Existing auth/read privacy behavior remains intact.

Only the host/current participant receives an address. Private outsiders receive concealed
404 responses and cannot join by UUID. Hosts have no Join control. Full, started and
canceled events disable participation, including a timer that closes controls at start.
Minimum age/experience remain guidance; no eligibility gate, code admission or admin
override was introduced. Backend enforcement remains authoritative.

## Local reproduction

Use existing local Supabase data and ignored `backend/.env`/`frontend/.env` configured from
their examples. Start `pnpm db:start`, apply only genuinely pending local migrations with
`pnpm exec supabase db push --local`, then run `pnpm dev:backend` and `pnpm dev` in separate
terminals. No new migration is required for this milestone. Register/confirm real accounts
through local Auth (mail at `http://127.0.0.1:55324`). To include legacy browser regressions,
explicitly enable `VITE_ENABLE_DEMO_MODE=true` in the development server; production still
cannot select numeric identities.

From the repository root (PowerShell can use `pnpm.cmd`):

```powershell
pnpm typecheck
pnpm lint
pnpm build
pnpm test:event-actions
pnpm test:events
pnpm test:profiles
pnpm test:geography
pnpm test:mock
pnpm test:backend
$env:RUN_LOCAL_EVENT_ACTIONS_UI='true'
$env:RUN_LOCAL_EVENT_READ_UI='true'
pnpm --filter frontend exec playwright test tests/event-actions-ui.spec.mjs tests/events-read-ui.spec.mjs
$env:RUN_LOCAL_AUTH_UI='true'
$env:RUN_LOCAL_PROFILE_UI='true'
pnpm --filter frontend exec playwright test tests/auth-ui.spec.mjs tests/profiles-ui.spec.mjs tests/location-ui.spec.mjs --project=1440-dark
$env:RUN_LOCAL_INTEGRATION='true'
pnpm --filter backend exec node --env-file-if-exists=.env --import tsx --test tests/integration/attendance.test.ts tests/integration/events.test.ts tests/integration/auth.test.ts tests/integration/profiles.test.ts tests/integration/geography.test.ts
pnpm db:lint
pnpm db:test
pnpm db:test:concurrency
```

## Executed evidence

- Workspace typecheck, lint/boundaries and frontend/backend production builds passed.
- Focused action client/cache/form/time suite: 12 passing Node entries (11 scenarios plus
  parent); real-read suite: 8; profiles: 3; geography: 6; numeric mock lifecycle: 12.
  These use mocked HTTP to verify client contracts; they do not prove database persistence.
- Backend automated suite: 34 passing checks. Real local integration: 16 passing entries
  covering Auth, profiles, geography, event CRUD/permissions and transactional attendance,
  including direct Data API denial and actual concurrent PostgreSQL requests.
- SQL lint: no schema errors. Six SQL suites: 276 passing assertions, including grants/RLS.
  Both separate-transaction final-seat/capacity concurrency checks passed.
- Real event read/action browser matrix: 15 passing scenarios. Nine intentional project
  skips avoid repeating the three focused edge-case tests outside 1440px dark; the main
  multi-user journey and both read scenarios run in all four width/theme projects.
  After visual review, the shared location-validation feedback was corrected and the
  action matrix was rerun: all seven action scenarios passed, with the same nine intentional
  skips and an explicit assertion that valid selection clears errors.
- Representative existing auth/profile/geography/demo browser regressions: seven passed at
  1440px dark, including actual confirmation/recovery, profile persistence and the isolated
  numeric create/edit/join/leave journey. No unexpected browser console errors were observed.

The browser workflow registers and confirms temporary real accounts through local Auth,
creates through the actual form/HTTP API, checks the stored UUID event in PostgreSQL,
discovers it publicly and reloads. A second account has no address before joining, gains it
after a real join and reload, then loses it after leaving. Membership row count is checked.
The host edits title/game/country/city/capacity, verifies persisted details/discovery, then
confirms deletion. The other account cannot edit/delete. Removed details return 404 and
discovery no longer contains the event.

Focused browser checks cover duplicate clicks, stale-full 409, actual backend 400 validation,
concurrent capacity 409, failed create/join/delete transport with retry, private creation,
unlisted direct access, private outsider concealment and private departure, invalid UUIDs,
blank venue, canceled/started controls, delayed protected reads, logout and Account A/B
mutation races. Delayed responses come from actual backend requests, not fabricated success
DTOs. A deterministic browser visibility transition triggers the stale-read scenario; an
earlier non-bubbling event caused a test timeout and was corrected. The first run also found
a missing discovery deletion notice, which was fixed and verified.

Screenshots of create/edit, participant details and deletion confirmation were captured at
375px/1440px in light/dark. Image loading and horizontal overflow are asserted; console/page
errors are checked with only expected transport/status diagnostics excluded. Real Auth
traces are disabled. Screenshots/results stay ignored under test output or `.tmp` paths;
no passwords, bearer tokens or session storage are intentionally retained in artifacts.

After verification, aggregate counts matched the pre-test baseline: 46,243 cities,
23,401 aliases, 8 games, and zero Auth accounts, profiles, events or memberships. Only
fixture-owned rows/accounts were removed; existing geography and application data were
preserved. Verification screenshots under `frontend/.tmp/` are explicitly ignored by Git.

## Remaining boundaries

- No Storage, profile/event upload, private invitation code, role/admin override or deployment.
- New production events/accounts are not seeded; an empty local discovery is expected until
  real users create public upcoming events. Numeric demos remain optional and nonpersistent.
- Auth, real catalogs and writes require configured local services; there is no offline or
  mock fallback. Backend capacity/access/time decisions can supersede a stale form.
- A server write may commit before its response is lost or an account changes. The UI does
  not falsely claim success; existing details/lists refetch. Create has no backend idempotency
  key, so inspect discovery before retrying an ambiguous create to avoid another event.
- End-to-end execution is local Chromium and local Supabase, not hosted delivery or an
  exhaustive browser/device/accessibility audit. Category filtering remains over loaded
  cursor pages as documented in 4C-1.
