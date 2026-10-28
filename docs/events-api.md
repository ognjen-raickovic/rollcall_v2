# Persistent event backend: Milestones 4A and 4B

Milestone 4A adds database-backed event HTTP operations; Milestone 4B adds persistent
join/leave and participant-aware details. React reads/actions consume these endpoints in
4C-1/4C-2, with numeric mocks isolated under development-only demo routes. Uploads, private
codes and administration remain deferred.

Milestone 4D now adds persistent cover endpoints described in
[event cover contracts](event-covers.md). The original 4A/4B boundary below is retained;
4D extends cover metadata to a custom version marker with a local fallback illustration.
Signed URLs are returned only by the separate authorized access endpoint.

## Current event requirements (migration 23)

New events use `all-levels`, `intermediate-plus`, `veteran-plus` recommendations, which do
not gate attendance. Existing `beginner`/`experienced` values remain unchanged and labeled
legacy; no automatic mapping. Discovery filters for the new values are exact. Legacy
beginner/experienced filters retain their existing include-all-levels semantics.

Six current tags exclude Beginner friendly/Veterans only. Casual/Competitive and
One-shot/Campaign cannot coexist; equipment tags can. The database permits unchanged
historical rules on unrelated edits, but actual tag/experience changes must resolve legacy
tags/conflicts explicitly. The form may require resolving conflicts before a full save.
New minimum-age enforcement, birthday/timezone semantics and grandfathering are defined in
[profile/event UX policy](profile-event-ux.md). These rules supersede the original 4A/4B scope.

## HTTP contract

| Method/path | Access/result |
| --- | --- |
| `GET /api/events` | Public discovery; `{ items: EventSummary[], pageInfo: { limit, nextCursor } }` |
| `GET /api/events/:eventId` | Public/unlisted detail, or verified private host/current participant; viewer-specific DTO |
| `POST /api/events` | Verified real account; 201 host detail and Location header |
| `PATCH /api/events/:eventId` | Verified host; 200 updated host detail |
| `DELETE /api/events/:eventId` | Verified host; 204 |
| `POST /api/events/:eventId/attendees/me` | Verified account joins its own seat; 200 AttendanceResult |
| `DELETE /api/events/:eventId/attendees/me` | Verified account leaves its own seat; 200 AttendanceResult |

IDs are UUIDs for events/accounts and positive PostgreSQL integers for games/cities/countries.
Missing or inaccessible events use the same 404 body; malformed UUIDs return 400. Writes
require verified Supabase bearer identity. On details, a supplied bearer must be valid;
omitting it requests the anonymous DTO. Discovery always uses public scope, even for hosts.
Responses are no-store; details vary on Authorization. Errors retain `{ code, message, fields }`.

### Discovery

Current 19–20 extensions and My Events are specified in
[navigation/discovery](navigation-discovery.md) and `docs/entities.md`: all filters and
four sort orders are database-wide, category is no longer a loaded-page filter, and
My Events is a separate authenticated owner/member read. The following describes the
original 4A baseline; legacy date/default-cursor behavior remains supported.

Strict query parameters: `search` (trimmed title substring, up to 100 characters), `country`
(two-letter ISO, uppercase-normalized), `cityId`, `gameId`, `startsAfter`, `startsBefore`,
`upcomingOnly` (default true), `availableOnly` (default false), `status` (only `scheduled`),
`limit` (default 12, 1–50) and `cursor`. Boolean query values must be `true` or `false`.
Dates are ISO instants with timezone; reversed ranges are rejected. Unknown/repeated query
keys are rejected. Only public scheduled events in enabled ME/RS/BA/HR countries appear.
No query option includes private, unlisted or cancelled events. Country derives from city.
Availability requires a future event with `participantCount < capacity`, even when
`upcomingOnly=false`. Search treats SQL wildcard characters literally.

Order is `startsAt ASC, id ASC`. Cursor pagination uses a bounded base64url JSON tuple
`{ startsAt, id }`; timestamps retain original precision. A cursor is a public position,
not an authorization credential. Use the same filters for subsequent pages. `nextCursor`
is null at the end. A limit-plus-one database read determines whether another page exists;
no unbounded count or offset scan is required.

### DTOs

`EventSummary`:

```text
id, title
game: { id, name, category }
city: { id, name, administrativeDivision: string | null }
country: { id, isoCode, name }
venue: string | null
startsAt, endsAt
capacity, participantCount, availableSlots
tags: EventTag[]
minimumAge, experienceLevel
visibility: public | unlisted | private
status: scheduled | cancelled
cover: { kind: 'default', imageUrl: <known local game illustration> }
```

Discovery summaries always have public/scheduled visibility/status. `PublicEventDetails`
extends the summary with `description`, `host: { id, displayName }`, `minimumAge`,
`experienceLevel`, `price`, `currency: 'EUR'`, `createdAt`, `updatedAt`.
All detail DTOs include `viewer: { userId: UUID | null, isHost: boolean, hasJoined: boolean }`.
Anonymous viewers have null/false/false. A verified nonparticipant gets its own UUID and
false/false. Hosts have true/false, and participants false/true; hosts never occupy a seat.
The backend verifies that the viewer UUID matches its independently verified request identity.
`HostEventDetails` and `ParticipantEventDetails` additionally contain `address`; public DTOs
omit that key completely. Summaries remain viewer-independent; migration 23 adds only the
safe stored age/recommendation.
No DTO exposes participant identities, emails, private age, roles or invitation data.
Public/unlisted details can include past/cancelled events. Private details require the host
or an existing membership. An unlisted URL, account role or sharing flag never grants address
access; only the verified host/current participant gets it. Leaving removes participant-only
address access, and subsequent private detail requests return the same 404 as missing events.

### Requests and validation

Create is a strict object with required `title` (3–100 trimmed), `description` (10–5000
trimmed), `gameId`, `cityId`, `address` (3–200 trimmed), `startsAt`, `endsAt`, `capacity`
(integer 1–100) and `experienceLevel` (`all-levels`, `intermediate-plus`, `veteran-plus`). Optional
`venue` accepts null/blank (stored null), otherwise 2–120 trimmed characters. Defaults are
`minimumAge: 0` (integer 0–99), `price: 0` (EUR, 0–10000, at most two decimals), `tags: []`
(at most six unique predefined values), `visibility: 'public'`, `coverStoragePath: null`.

The game and city must exist; the city's country must be enabled and supported. Country,
host, participant count, IDs and timestamps cannot be supplied. Starts must be future and
end after start. New tags: Casual, Competitive, One-shot, Campaign, Bring your own deck,
Equipment provided. Atmosphere and session-format pairs are exclusive. PostgreSQL validates
the final merged values as well as the API, preserving unchanged historical rules above.

PATCH is a strict nonempty partial create payload plus optional `status` (`scheduled` or
`cancelled`). It preserves host/identity/attendance and validates the merged schedule,
references and tags. Capacity cannot be reduced below attendance (409). Any content edit,
including address-only changes, requires a future final start; rescheduling a past event
must provide a valid future schedule. Invalid combined public/private writes roll back.

DELETE is a hard delete: its protected location and existing membership rows cascade;
referenced profiles, games and cities remain. Missing/inaccessible/repeated deletes return
404. No endpoint lets a host/admin remove another account's membership in this milestone.

### Attendance requests, state and idempotency

POST and DELETE `/api/events/:eventId/attendees/me` accept no body or `{}` and no query
parameters. Event IDs must be UUIDs. No actor, user, profile, host or capacity field is
accepted; the only participant identity is the verified Supabase subject. Both operations
return 200 JSON, including no-ops:

```json
{
  "eventId": "00000000-0000-4000-8000-000000000001",
  "hasJoined": true,
  "capacity": 4,
  "participantCount": 1,
  "availableSlots": 3
}
```

DELETE returns `hasJoined: false`. The summary intentionally has no address or full event
details, so leaving a private event can succeed while removing detail access. HTTP responses
use `Cache-Control: no-store` and `Vary: Authorization`; clients must also isolate detail
caches by verified account and invalidate discovery/detail queries after mutations.

Checks occur in order: authentication, event existence/visibility, scheduled/future state,
host exclusion, membership and capacity. Missing/inaccessible events return 404; timing,
host and full-event conflicts return 409 `CONFLICT`. Invalid IDs/payloads/query fields return
400; missing/invalid tokens return 401. State checks precede idempotency: even an existing
participant cannot repeat a join/leave on a past/cancelled event. The start boundary is checked
against actual time after acquiring the event lock.

Any active verified account may join public/unlisted events when those checks pass and
private DOB satisfies any minimum age. Failure returns 403 AGE_REQUIREMENT_NOT_MET; missing
complete DOB returns 403 AGE_INFORMATION_REQUIRED. Skill/tags remain advisory. A repeat join
by a current participant is a no-op even if full and does not reassess age.
An accessible public/unlisted nonmember leave is a no-op. No-ops preserve membership timestamps,
event count and updatedAt. The host is never a participant and gets a conflict on either action.

Private outsiders cannot discover details or join/leave merely by knowing a UUID. Existing
private participants can remain, repeat join or leave; membership may legitimately predate
a host's visibility change. After leaving they cannot rejoin or repeat leave without another
authorized admission mechanism; subsequent private operations return 404 to conceal existence.
Room-code admission and role overrides are not implemented. No participant lists are exposed.

### Original 4A cover boundary (extended by 4D)

Only null/omitted `coverStoragePath` is accepted in 4A. Arbitrary paths, image data URLs,
external/signed URLs and mock `imageUrl` payloads are rejected. Returned cover information
uses the existing local game-category illustrations, without pretending an upload occurred.
Paths are `/images/role-playing.svg`, `/images/trading-card.svg`, `/images/board-games.svg`
and `/images/social-deduction.svg` (the board-game filename is plural).
Storage ownership, validation, replacement/deletion and private delivery belong to 4D.

## Database interface and security

The runtime uses existing unprivileged Supabase clients, isolated per authenticated request.
No service-role key or direct maintenance connection is used by event routes.

Public RPC interfaces are `discover_events(p_filters jsonb)`, `get_event(p_event_id uuid)`,
`create_event(p_input jsonb)`, `update_event(p_event_id uuid, p_patch jsonb)` and
`delete_event(p_event_id uuid)`. Discovery filters passed to SQL contain normalized API
fields plus optional `afterStartsAt`/`afterId` instead of an encoded cursor. SQL returns
`{ items, hasMore }`; the backend emits the HTTP pageInfo/cursor. Detail/create/update
functions return explicit camelCase JSON DTOs; delete returns void.
Attendance uses `join_event(p_event_id uuid)` and `leave_event(p_event_id uuid)`, returning
the safe attendance summary above. Neither accepts a participant ID.

Table permissions remain closed to ordinary clients. A narrowly scoped NOLOGIN,
NOBYPASSRLS executor role owns hardened private functions with explicit RLS policies.
Public wrappers are SECURITY INVOKER and delegate only to the bounded, checked private
functions. Ownership is derived from `auth.uid()`, never an input actor. Function execution,
schema access and table grants are explicit. Content writes use host checks; details use
host/current-membership checks; list
predicates enforce discovery independently of caller identity. Protected address access
requires the host or current membership, regardless of sharing flags. Deferred location
invariants run in the restricted trigger context described below.

Two additive migrations implement this boundary: `20261025000200_events_api.sql` and
`20261025000300_event_executor_identity.sql`. The latter uses a private argument-free
`event_api_actor()` owned by the trusted migration role solely to resolve `auth.uid()`
across Supabase's Auth-schema ownership boundary. It reads no tables and only the executor
may execute it. There is no privileged runtime client. The 4A executor has no direct counter,
host-reassignment or role-management privileges. The 4B migration adds only owner-scoped
membership reads/inserts/deletes behind the checked attendance functions.

`20261025000400_event_attendance.sql` reuses `event_participants`, its unique event/profile
key, foreign keys and existing counter/invariant trigger bodies. Attendance locks the event
before checking/mutating membership; host capacity/content changes and deletion serialize
on the same row. A lock-only executor UPDATE policy uses readable rows with `WITH CHECK
(false)`; it allows SELECT FOR UPDATE without permitting non-host content updates. The
existing host-only content check remains. Membership RLS depends only on the current actor,
avoiding cyclic event/membership policies. Raw client tables remain closed.

Existing counter/location-invariant triggers now run as the separate NOLOGIN/NOBYPASSRLS
`rollcall_attendance_counter`, with SELECT on required event columns, UPDATE(participant_count)
and SELECT(event_id) on protected locations only. It cannot read addresses, change content,
write memberships or assign roles. Its trigger functions have empty search paths and no
client execution grants. This allows atomic counters and deferred invariants even after a
private leave removes the executor's detail access. Failed operations roll back membership
and counter changes together; duplicates do not create extra rows or seats.
The additive `20261025000500_attendance_private_recheck.sql` rechecks membership immediately
after the lock with a fresh command snapshot, before returning private event state. This
prevents a waiting private request from using membership removed by a concurrent leave.

Direct PostgREST missing/unauthorized event RPCs use database code `P0002` (PostgREST HTTP
500); Fastify deliberately normalizes that code to the same sanitized 404 for both cases.
The application contract is the Fastify HTTP API, not raw PostgREST error messages.

## Local setup and delivery boundary

Use the existing ignored backend environment and running local Supabase stack. No new
variables, packages, bucket or remote setup is required. From the root, apply pending
migrations with `pnpm exec supabase db push --local`, preserving existing data; do not reset
or rerun the geography import. Start Fastify with `pnpm dev:backend`. The database seed has
no real events/accounts; register and confirm a real local account before creating events.

React production reads and writes call the real API in 4C-1/4C-2. Numeric demo actors/events
remain isolated under opt-in development `/demo/events/*`.
Real join/leave and participant address access are implemented in 4B; custom covers/Storage are
4D; private codes and role-authorized access are 5. Account roles and claimed experience
do not grant extra event access in 4A. No deployment or hosted migration has been performed.

Executed checks are recorded in [4A verification](events-api-verification.md) and
[4B attendance verification](attendance-verification.md). PostgreSQL's
[policy rules](https://www.postgresql.org/docs/17/sql-createpolicy.html) and
[row locking](https://www.postgresql.org/docs/17/explicit-locking.html) describe the primitives
used here; project-specific guarantees come from the executed database/RPC tests.

## Frontend consumption: Milestone 4C-1

Homepage featured events and `/events` use validated real public summaries and cursor pages.
`/events/:eventId` validates UUIDs and uses the current Supabase session for viewer-specific
details. Summary cards contain no protected addresses or invented prices. Details use actual
host/game/location fields and explicit viewer state; only matching hosts/participants get an
address. Inactive sensitive caches are discarded, auth transitions clear old queries before
changing viewer state, abort signals cancel old requests and identity is rechecked after HTTP.
Tokens stay out of query keys/URLs/logs; requests reject unrelated paths and redirects.

Discovery keys include backend filters and the frontend category scope. Pages use the returned
cursor, and filter changes start at the first page. Category is not a backend query parameter:
it filters loaded pages without changing chronological order, and Load More remains available
while the backend has further pages. Empty/error/retry states never substitute mocks.

## Frontend mutations: Milestone 4C-2

Real `/events/new`, `/events/:eventId/edit` and detail action controls use the existing five
write endpoints through validated feature APIs and TanStack Query hooks. Create/update send
only allowed fields (selected cityId, no derived country or owner); blank venue becomes null.
Local picker times become ISO instants; unchanged edit times retain exact original precision.
Backend 400/409 `{ code, message, fields }` errors map to inline feedback and preserve drafts.
Generic network/dependency errors remain safe; writes never fall back to mocks or auto-retry.

The host-only editor uses viewer-specific details and the deletion dialog requires explicit
confirmation. Joining reads back actual authorized details; leaving immediately hides protected
addresses and uses the acknowledged safe counter result. Losing private membership navigates
to discovery. Closed/full/private access rules remain server-authoritative, and age/experience
remain guidance. Public lists/homepage and affected UUID details refresh after mutations.

Mutation envelopes retain the initiating UUID/session; auth changes abort requests and discard
late cache effects, feedback and navigation. Old detail reads are canceled before effects;
inactive mutation data is discarded. There are no optimistic updates. Data URLs and arbitrary
storage references are rejected: real forms show default illustrations until 4D. Numeric demo
forms retain their existing custom-cover behavior under isolated development routes.
Backend endpoints, migrations and database permissions are unchanged. See
[action verification](event-actions-verification.md) and historical
[read verification](event-frontend-verification.md).

## Milestone 5A

5A adds host GET /api/events/:id/invitation and POST invitation/rotate or invitation/revoke, plus authenticated POST /api/private-events/join with only {code}. UUID-only private admission remains denied. See [contracts and security](private-invitations.md).

## Milestone 5B-1

Administrative roles do not bypass event ownership, visibility, capacity, protected addresses, invitation management or cover authorization. The 5B-1 role-management APIs are separate; see [administration](administration.md).

## Milestone 5B-2A

POST /api/events/:eventId/reports accepts only reason/description from a real verified viewer; private host/current participants may report. The dedicated /api/admin/event-reports queue/detail/dismiss/take-action endpoints permit current admins/superadmins to cancel only the reported event, never edit arbitrary fields or retrieve private content. Cancellation removes scheduled discovery/joining, revokes invitations and prevents host reactivation. Hosts retain cancelled metadata editing/deletion. See [full contracts](event-moderation.md).

## Milestone 5B-2B

5B-2B rejects suspended callers for event writes, attendance, reporting, private admission/invitation management and protected reads/capabilities, including direct RPCs. Existing events/memberships remain unchanged; anonymous public discovery continues. Account locks precede existing event locks, and reinstatement restores the same account’s permitted operations. See [boundary and tests](account-suspensions.md).
