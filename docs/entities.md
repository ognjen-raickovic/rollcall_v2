# RollCall entities and API contract

Shared contract for Workshop 3 mocks and a future backend. Feature types live in
`frontend/src/features/<domain>/types.ts`; APIs and fixtures live in that feature's `api/`.
Users and games are read-only in this scope. Events support CRUD plus attendance.

## Common conventions

- IDs: positive safe integers, assigned by the server/mock. Unknown well-formed resource IDs
  produce 404; malformed IDs produce 400. Relationships use IDs, not imported feature types.
- Dates: ISO 8601 strings with a timezone (`Z` or an explicit offset). Compare instants, not
  strings. The UI displays dates in the viewer's local time. Timestamps are serialized strings.
- Success: `list` resolves to an array, `get`/create/update/join/leave to an entity, remove to
  void. No response envelope or pagination in this foundation. HTTP should use the same JSON
  payloads (200 for reads/update/attendance, 201 create, 204 delete).
- Errors: APIs reject asynchronously with `ApiError` containing `code`, `status`, `message`,
  and `fields: Record<string, string[]>`. `NotFoundError` extends it. Future HTTP uses JSON
  `{ code, message, fields }` and the corresponding status. `_form` holds cross-field errors.
- Error codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403),
  `NOT_FOUND` (404), `CONFLICT` (409). Validation field errors are arrays of messages.
- Strict inputs reject unknown keys, including attempts to set IDs, organizers, attendees,
  or timestamps. Strings are trimmed before validation. Failed mutations leave data unchanged.
- Mocks add 400 ms latency and clone every result. State is in memory, per browser runtime;
  reload resets it. Event writes run their checks and mutation together after latency so
  simultaneous joins cannot claim the same final seat. This is not a multi-client backend.
- `src/lib/mock-db.ts` holds common errors, request helpers, `MockActor`, and stable user/game
  fixture IDs (1–8). Entity records stay in their own feature. When changing catalog fixtures,
  update the reference IDs too. User/game writes are intentionally unavailable.

## User

Code: `frontend/src/features/users/`.

| Field | Type | Rules |
| --- | --- | --- |
| id | number | Required, assigned positive safe integer |
| displayName | string | Required, 2–80 trimmed characters |
| city | string | Required, 2–80 trimmed characters |
| bio | string | Required; may be empty, up to 500 characters |
| createdAt | ISO timestamp string | Required, assigned |

Public profile only: no credentials, private email, roles, or session tokens. All users may
organize and attend events. One user organizes many events; participation is many-to-many
through each event's attendee IDs. Profile creation/update rules are reserved for later work;
these constraints describe curated fixtures and the intended future write contract.

**Access:** everyone can list/get public profiles; no user write endpoints in Workshop 3.

| Mock function | Intended HTTP | Contract |
| --- | --- | --- |
| `usersApi.list(filters?)` | `GET /users?search=&city=` | `Promise<User[]>`, ascending fixture ID |
| `usersApi.get(id)` | `GET /users/:id` | `Promise<User>` |

`UserFilters`: optional `search` (0–100 characters, case-insensitive display-name substring)
and `city` (0–80 characters, case-insensitive exact match); empty values do not filter.
Unknown filters fail with 400. Hooks: `useUsers(filters?)`, `useUser(id)`.

## Game

Code: `frontend/src/features/games/`.

| Field | Type | Rules |
| --- | --- | --- |
| id | number | Required, assigned positive safe integer |
| name | string | Required, 2–100 trimmed characters |
| category | GameCategory | Required enum below |
| description | string | Required, 10–1000 characters |
| minPlayers | number | Required, integer >= 1 |
| maxPlayers | number | Required, integer >= minPlayers |

`GameCategory`: `role-playing`, `trading-card`, `board-game`, `social-deduction`.
A game has many events. Player counts are guidance for a single game table, not event
capacity limits: an event can host several tables. These constraints describe curated
fixtures; catalog editing is outside this workshop.

**Access:** public list/get. No game creation/update/removal endpoints in this scope.

| Mock function | Intended HTTP | Contract |
| --- | --- | --- |
| `gamesApi.list(filters?)` | `GET /games?search=&category=` | `Promise<Game[]>`, ascending fixture ID |
| `gamesApi.get(id)` | `GET /games/:id` | `Promise<Game>` |

`GameFilters`: optional `search` (0–100 characters, case-insensitive name substring),
`category` (GameCategory enum). Unknown filters fail with 400.
Hooks: `useGames(filters?)`, `useGame(id)`.

## Event

Code: `frontend/src/features/events/`.

| Field | Type | Create/update rules |
| --- | --- | --- |
| id | number | Assigned positive safe integer; immutable |
| title | string | Required, 3–100 trimmed characters |
| description | string | Required, 10–5000 trimmed characters |
| gameId | number | Required positive safe integer referencing an existing game |
| organizerId | number | Assigned from actor on create; immutable, existing user |
| city | string | Required, 2–80 trimmed characters |
| venue | string | Required, 2–120 trimmed characters |
| address | string | Required, 3–200 trimmed characters |
| startsAt | ISO timestamp string | Required, strictly in the future on create/update |
| endsAt | ISO timestamp string | Required, strictly after startsAt |
| capacity | number | Required integer 1–100; player seats, excluding organizer |
| attendeeIds | number[] | Assigned empty; unique existing users, excluding organizer; managed by join/leave |
| experienceLevel | ExperienceLevel | Required: `all-levels`, `beginner`, `experienced` |
| price | number | Required, EUR, 0–10000, maximum two decimal places; 0 means free |
| imageUrl | string or null | Required key; null for no image, otherwise HTTP(S) URL up to 2000 characters |
| status | EventStatus | Assigned `scheduled` on create; update may set `scheduled` or `cancelled` |
| createdAt | ISO timestamp string | Assigned on create, immutable |
| updatedAt | ISO timestamp string | Assigned on create and successful state changes |

`NewEvent` contains the required editable fields, excluding id, organizerId, attendeeIds,
status, createdAt, updatedAt. `UpdateEvent` is a nonempty partial NewEvent plus optional status.
Both reject unknown fields. In mock partial updates, undefined values are treated as omitted;
at least one defined field is required. Attendees cannot exceed capacity; reducing capacity below current
attendance returns 409. Canceling preserves attendance; an organizer may reschedule a canceled
future event by setting status back to scheduled. Updating validates the merged event, including
future start and end order. Past events remain readable and removable, but cannot be updated
unless the update moves their start into the future. Organizer, game, and attendees have no
cascade behavior because users/games cannot be deleted in this scope. Removing an event also
removes its embedded attendance.

### Access and attendance

Reads are public. Mock writes require `MockActor = { userId: number | null }` as the last
argument. Missing/null/unknown user is 401. Any known mock user can create. Only the organizer
can update/remove; a different known user receives 403. There is no global default user, login
state, or route protection yet. A future backend must derive the actor from a verified session,
never trust a client-supplied user ID. Mock actor objects are not HTTP request bodies.

Any known non-organizer may join/leave only a scheduled event that has not started. Canceled
or started events return 409. Organizers cannot join/leave their own events (409) and never
occupy a player seat. Joining a full event returns 409. Repeat join by an existing attendee
returns the unchanged event, even if full; repeat leave by a non-attendee returns it unchanged.
These no-ops do not change updatedAt. Open-event and organizer rules still apply to repeats.
A user can only join/leave as themselves; there is no endpoint to change another attendee.

Write checks occur in this order: actor, resource ID/existence, authorization, input validation,
then state constraints. Join/leave check event availability before membership/capacity.

### API

| Mock function | Intended HTTP | Result |
| --- | --- | --- |
| `eventsApi.list(filters?)` | `GET /events` with filters below | `Promise<Event[]>` |
| `eventsApi.get(id)` | `GET /events/:id` | `Promise<Event>` |
| `eventsApi.create(input, actor)` | `POST /events` with NewEvent | `Promise<Event>` |
| `eventsApi.update(id, changes, actor)` | `PATCH /events/:id` with UpdateEvent | `Promise<Event>` |
| `eventsApi.remove(id, actor)` | `DELETE /events/:id` | `Promise<void>` |
| `eventsApi.join(id, actor)` | `POST /events/:id/attendees/me` with no body | `Promise<Event>` |
| `eventsApi.leave(id, actor)` | `DELETE /events/:id/attendees/me` | `Promise<Event>` (200 JSON) |

`EventFilters` (all optional):

| Filter | Validation and behavior |
| --- | --- |
| search | 0–100 characters; case-insensitive substring across title, description, venue |
| city | 0–80 characters; case-insensitive exact match; empty means all |
| gameId | Positive safe integer; exact match; unknown ID returns an empty list |
| startsAfter | ISO timestamp with timezone; inclusive lower bound on event start |
| startsBefore | ISO timestamp with timezone; inclusive upper bound; cannot precede startsAfter |
| availableOnly | Boolean; true restricts to scheduled future events with open player seats |
| status | `scheduled` or `cancelled` |

Unknown filters fail with 400. Results sort by start instant ascending, then ID. No filters
returns all events, including canceled/past events. Future HTTP booleans/numbers are parsed
from query strings before validation. Category discovery is a later route-composition concern:
use the games catalog to choose matching game IDs; category is not a duplicated event field.

Hooks: `useEvents`, `useEvent`, `useCreateEvent`, `useUpdateEvent`, `useRemoveEvent`,
`useJoinEvent`, `useLeaveEvent`. Mutation variables contain the API input plus `actor` (and
`id` where needed). Cache keys follow `[domain]`, `[domain, id]`, `[domain, filters]`.
All event mutation successes invalidate the `['events']` prefix (lists and details); removal
also removes the deleted detail cache. Detail hooks disable invalid IDs; views explain invalid
IDs rather than remaining in a pending state.

## Fixture coverage and future implementation

Each domain has eight English-language fixtures. Events include empty, full, beginner,
experienced, free, paid, and canceled examples across Budapest, Szeged, Belgrade, and Novi Sad.
Locations and events are illustrative, not real scheduled bookings. Dates are fixed in November
2026; as time passes they intentionally become historical. Create new future events to exercise
attendance after these dates. IDs in shared references must match users/games fixtures.

A later backend should preserve these return payloads, error codes, and access semantics,
with durable storage, authenticated sessions, database foreign keys, unique attendance,
and transactional capacity enforcement. No HTTP server is implemented in Workshop 3.
