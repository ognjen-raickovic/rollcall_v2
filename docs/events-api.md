# Milestone 4A: persistent event backend

This milestone adds database-backed event HTTP operations. React event CRUD/attendance
continues using its existing numeric mocks; frontend integration is Milestone 4C. No real
join/leave, uploads, private codes or administration is implemented here.

## HTTP contract

| Method/path | Access/result |
| --- | --- |
| `GET /api/events` | Public discovery; `{ items: EventSummary[], pageInfo: { limit, nextCursor } }` |
| `GET /api/events/:eventId` | Public/unlisted detail, or verified private host; public/host DTO |
| `POST /api/events` | Verified real account; 201 host detail and Location header |
| `PATCH /api/events/:eventId` | Verified host; 200 updated host detail |
| `DELETE /api/events/:eventId` | Verified host; 204 |

IDs are UUIDs for events/accounts and positive PostgreSQL integers for games/cities/countries.
Missing or inaccessible events use the same 404 body; malformed UUIDs return 400. Writes
require verified Supabase bearer identity. On details, a supplied bearer must be valid;
omitting it requests the anonymous DTO. Discovery always uses public scope, even for hosts.
Responses are no-store; details vary on Authorization. Errors retain `{ code, message, fields }`.

### Discovery

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
visibility: public | unlisted | private
status: scheduled | cancelled
cover: { kind: 'default', imageUrl: <known local game illustration> }
```

Discovery summaries always have public/scheduled visibility/status. `PublicEventDetails`
extends the summary with `description`, `host: { id, displayName }`, `minimumAge`,
`experienceLevel`, `price`, `currency: 'EUR'`, `createdAt`, `updatedAt`.
`HostEventDetails` additionally contains `address`; public DTOs omit that key completely.
No DTO exposes participant identities, emails, private age, roles or invitation data.
Public/unlisted details can include past/cancelled events; private details are host-only.
An unlisted URL never grants address access. Participant address access is deferred to 4B.

### Requests and validation

Create is a strict object with required `title` (3–100 trimmed), `description` (10–5000
trimmed), `gameId`, `cityId`, `address` (3–200 trimmed), `startsAt`, `endsAt`, `capacity`
(integer 1–100) and `experienceLevel` (`all-levels`, `beginner`, `experienced`). Optional
`venue` accepts null/blank (stored null), otherwise 2–120 trimmed characters. Defaults are
`minimumAge: 0` (integer 0–99), `price: 0` (EUR, 0–10000, at most two decimals), `tags: []`
(at most six unique predefined values), `visibility: 'public'`, `coverStoragePath: null`.

The game and city must exist; the city's country must be enabled and supported. Country,
host, participant count, IDs and timestamps cannot be supplied. Starts must be future and
end after start. Tags mirror the existing curated vocabulary: Beginner friendly, Veterans
only, Casual, Competitive, One-shot, Campaign, Bring your own deck, Equipment provided.
Beginner friendly requires all-levels/beginner; Veterans only requires experienced; the pair
is mutually exclusive. PostgreSQL validates the final merged values as well as the API.

PATCH is a strict nonempty partial create payload plus optional `status` (`scheduled` or
`cancelled`). It preserves host/identity/attendance and validates the merged schedule,
references and tags. Capacity cannot be reduced below attendance (409). Any content edit,
including address-only changes, requires a future final start; rescheduling a past event
must provide a valid future schedule. Invalid combined public/private writes roll back.

DELETE is a hard delete: its protected location and existing membership rows cascade;
referenced profiles, games and cities remain. Missing/inaccessible/repeated deletes return
404. No participant management API is introduced.

### Interim covers

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

Table permissions remain closed to ordinary clients. A narrowly scoped NOLOGIN,
NOBYPASSRLS executor role owns hardened private functions with explicit RLS policies.
Public wrappers are SECURITY INVOKER and delegate only to the bounded, checked private
functions. Ownership is derived from `auth.uid()`, never an input actor. Function execution,
schema access and table grants are explicit. Details and writes use host checks; list
predicates enforce discovery independently of caller identity. Protected address access
remains host-only even if an existing sharing flag is true. Deferred location invariants
must be checked while the authorized executor context is active.

Two additive migrations implement this boundary: `20261025000200_events_api.sql` and
`20261025000300_event_executor_identity.sql`. The latter uses a private argument-free
`event_api_actor()` owned by the trusted migration role solely to resolve `auth.uid()`
across Supabase's Auth-schema ownership boundary. It reads no tables and only the executor
may execute it. There is no privileged runtime client. The executor has no membership
writes, counter updates, host reassignment or role-management privileges. A sharing flag,
participant record or admin role never grants address/private-detail access in 4A.

Direct PostgREST missing/unauthorized event RPCs use database code `P0002` (PostgREST HTTP
500); Fastify deliberately normalizes that code to the same sanitized 404 for both cases.
The application contract is the Fastify HTTP API, not raw PostgREST error messages.

## Local setup and delivery boundary

Use the existing ignored backend environment and running local Supabase stack. No new
variables, packages, bucket or remote setup is required. From the root, apply pending
migrations with `pnpm exec supabase db push --local`, preserving existing data; do not reset
or rerun the geography import. Start Fastify with `pnpm dev:backend`. The database seed has
no real events/accounts; register and confirm a real local account before creating events.

React continues calling its mock event APIs and numeric demo actors. Real join/leave and
participant address policy are 4B; frontend event adapters are 4C; custom covers/Storage are
4D; private codes and role-authorized access are 5. Account roles and claimed experience
do not grant extra event access in 4A. No deployment or hosted migration has been performed.

Implementation and executed checks are recorded in [verification](events-api-verification.md).
