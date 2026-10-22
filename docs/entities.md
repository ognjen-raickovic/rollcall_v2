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
| imageUrl | string or null | Required key; null, HTTP(S) URL up to 2000 characters, or local `/images/<kebab-name>.(svg,webp,png,jpg)` path |
| tags | string[] | Required; 0–6 unique tags (case-insensitive), each 2–30 trimmed characters |
| minimumAge | number | Required integer 0–99; 0 means all ages; informational event guidance |
| visibility | EventVisibility | Required: `public`, `private`, or `unlisted`; only public events enter discovery |
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

Public/unlisted reads are public. Mock writes require `MockActor = { userId: number | null }` as the last
argument. Missing/null/unknown user is 401. Any known mock user can create. Only the organizer
can update/remove; a different known user receives 403. There is no global default user.
The demo session supplies the selected user ID to attendance through route props. A future backend must derive the actor from a verified session,
never trust a client-supplied user ID. Mock actor objects are not HTTP request bodies.

Any known non-organizer may join/leave only a scheduled event that has not started. Canceled
or started events return 409. Organizers cannot join/leave their own events (409) and never
occupy a player seat. Joining a full event returns 409. Repeat join by an existing attendee
returns the unchanged event, even if full; repeat leave by a non-attendee returns it unchanged.
These no-ops do not change updatedAt. Open-event and organizer rules still apply to repeats.
A user can only join/leave as themselves; there is no endpoint to change another attendee.

Public discovery shows only upcoming scheduled public events. Unlisted events are accessible
by direct link and can be joined under the same attendance rules; this is not an invitation
system or a privacy guarantee. Private events are not returned by list APIs. `get` requires a
known mock actor (401 otherwise), then checks for host/current participation (403 otherwise).
Private events do not admit new participants; existing participants can repeat join or leave
under the normal scheduled/future rules. Leaving revokes their private read access and the UI
returns to discovery with confirmation. Making an existing event private preserves its attendees.
There are no invitations, membership management, or real authentication/security.
The mock API can explicitly filter unlisted records for contract
checks, but the app does not expose this as discovery. Minimum age is guidance only: demo
profiles do not have a date of birth, and there is no age verification in this workshop.

Write checks occur in this order: actor, resource ID/existence, authorization, input validation,
then state constraints. Join/leave check event availability before membership/capacity.

### API

| Mock function | Intended HTTP | Result |
| --- | --- | --- |
| `eventsApi.list(filters?)` | `GET /events` with filters below | `Promise<Event[]>` |
| `eventsApi.get(id, actor?)` | `GET /events/:id` (future server derives actor from session) | `Promise<Event>` |
| `eventsApi.create(input, actor)` | `POST /events` with NewEvent | `Promise<Event>` |
| `eventsApi.update(id, changes, actor)` | `PATCH /events/:id` with UpdateEvent | `Promise<Event>` |
| `eventsApi.remove(id, actor)` | `DELETE /events/:id` | `Promise<void>` |
| `eventsApi.join(id, actor)` | `POST /events/:id/attendees/me` with no body | `Promise<Event>` |
| `eventsApi.leave(id, actor)` | `DELETE /events/:id/attendees/me` | `Promise<Event>` (200 JSON) |

`EventFilters` (all optional):

| Filter | Validation and behavior |
| --- | --- |
| search | 0–100 characters; case-insensitive substring of event title only |
| city | 0–80 characters; case-insensitive exact match; empty means all |
| gameId | Positive safe integer; exact match; unknown ID returns an empty list |
| startsAfter | ISO timestamp with timezone; inclusive lower bound on event start |
| startsBefore | ISO timestamp with timezone; inclusive upper bound; cannot precede startsAfter |
| availableOnly | Boolean; true restricts to scheduled future events with open player seats |
| status | `scheduled` or `cancelled` |
| visibility | `public` (default) or `unlisted` |
| upcomingOnly | Boolean; true restricts to scheduled events whose start is strictly in the future at request time |

Unknown filters fail with 400. Results sort by start instant ascending, then ID. No filters
returns all public events, including canceled/past events. `/events` and homepage discovery
always use `upcomingOnly: true` and `visibility: 'public'`. City/game/availability filters combine
with title search using AND; `availableOnly: true` excludes full tables. An empty city/game
selector means no restriction. Future HTTP booleans/numbers are parsed
from query strings before validation. Category discovery is a later route-composition concern:
use the games catalog to choose matching game IDs; category is not a duplicated event field.

Hooks: `useEvents`, `useEvent`, `useCreateEvent`, `useUpdateEvent`, `useRemoveEvent`,
`useJoinEvent`, `useLeaveEvent`. Mutation variables contain the API input plus `actor` (and
`id` where needed). Lists use `['events', filters]`. Detail hooks accept `useEvent(id, userId?)`
and key records by `['events', id, userId]`, with null for anonymous reads; changing identity
selects another cache entry rather than rendering a previous user's private record.
All event mutation successes invalidate the `['events']` prefix (lists and details). Create,
update, join, and leave also set the returned entity into `['events', id, actor.userId]`
immediately; attendance errors invalidate the prefix
to refresh possibly stale capacity. Pending controls prevent repeated clicks, while the API
retains idempotent joins/leaves and atomic capacity checks. Visible success messages use a live
status region; mutation errors use an alert. Removal
also removes the deleted detail cache. Detail hooks disable invalid IDs; views explain invalid
IDs rather than remaining in a pending state.

## Frontend demo session

The users domain owns `api/session-api.ts`, `api/use-session.ts`, login UI, and the
`RequireSession` guard. Public profile records are still read-only. Session selection is
a browser-only operation, not a user entity write or a real authentication endpoint.

| Operation | Contract |
| --- | --- |
| `sessionApi.get()` | `Promise<User \| null>`; restore a known profile or return anonymous |
| `sessionApi.login(userId)` | `Promise<User>`; validate through `usersApi.get`, then select the profile |
| `sessionApi.logout()` | `Promise<null>`; clear the selection |

`useSession` caches the current public User or null at `['session']`; `useLogin`/`useLogout`
cancel pending session reads and update that cache on success. Session reads do not automatically
retry failures. No credentials, private email, session tokens, or user roles are added.
Login failures preserve the previous selection. The selected positive integer ID is stored at
sessionStorage key `rollcall.demo-user-id`, so it survives refresh within the tab. Invalid or
unknown stored IDs are cleared. Storage failures fall back to in-memory state until reload.
Only the selected ID is persisted; profiles continue to come from the existing mock API.

Anonymous users can browse public/unlisted events. Create/edit require a demo session;
event join/leave derives the actor from the current user. Anonymous join redirects to
`/login?returnTo=<encoded internal path>`, then returns to the event without automatically
joining. Only the organizer sees the Edit Event link. The editor checks ownership before
rendering any form and update checks it again in the API. Non-hosts get an authorization state;
missing/invalid IDs get recovery links. Private detail reads use the same explicit mock actor.

`returnTo` rejects external URLs, protocol-relative paths, backslashes, control characters,
and login self-redirects (including encoded equivalents). Invalid targets fall back to `/events`.
Logout clears navigation/current-user state and protected routes redirect to login. Event
records remain in memory; session persistence does not persist attendance changes on reload.
This mechanism simulates identity only and offers no security. Future real session endpoints
and credential contracts must be designed with the backend; these demo operations make no HTTP calls.

For UI composition, event discovery accepts structural game summaries (ID/name/category)
from app routes, and attendance accepts a current-user ID and session loading/error flags.
The detail route supplies host/game render slots composed from the users/games query components;
these independently handle profile/game loading failures and retries without losing event details.
These are component props, not duplicated entities or cross-feature imports. `/events` accepts
`category` in its URL and filters events using games supplied by the route; the event REST
contract itself still has no category field or category parameter.

## Shared create/edit form

`EventForm` is used by both `/events/new` and `/events/:eventId/edit`, with route-composed
game summaries and demo identity. `EventEditor` owns loading/error/empty/authorization states;
the form owns inputs and `useEventForm` submits via `useCreateEvent`/`useUpdateEvent`.
Profile/game features are not imported into events.

`api/event-validation.ts` defines the shared field, new-event, and partial-update schemas.
Updates validate the merged editable values before mutating state. `api/event-form-values.ts`
adapts comma-separated tags and local `datetime-local` picker strings to the same NewEvent
contract; it does not perform requests. Impossible dates/local times and missing, past, or
reversed schedules are rejected. End time and venue are required by the existing contract.
Capacity/age are integers; price is EUR with at most two decimals. The form validates capacity
against known attendance, and the API rechecks latest attendance, returning a 409 with an
inline `fields.capacity` message if a concurrent change makes the submitted capacity too low.

Form inputs include experience level and price so edits preserve those event details. Covers
are picked from bundled game-category illustrations on create/game changes; otherwise the
existing image is preserved. No image-upload feature is added. Tags may be blank, otherwise
comma-separated, unique ignoring case, with existing count/length limits.

All required fields have labels and associated inline errors. Validation failures show a summary;
server errors retain the user's values and map field errors back into the form. Submit controls
and fields are disabled during a save, with a submission lock preventing duplicate dispatches.
Successful create/edit operations navigate to the saved event with a live confirmation notice.
The form never submits organizerId, attendeeIds, status, IDs, createdAt, or updatedAt. Edits preserve
current status (including canceled), and only API-assigned fields may change those values.

The new private value extends rather than renames the previous unlisted contract. The list
filter still accepts only public/unlisted visibility, so private data cannot be enumerated via
discovery. Host/current-participant access is simulated in memory and does not constitute
real security. New events and edits, including privacy changes, reset on page reload.

## Fixture coverage and future implementation

Users and games each have eight English-language fixtures. Events have ten, covering Podgorica,
Niksic, Budva, Bar, Kotor, Cetinje, Herceg Novi, and Tivat. They include seven upcoming public
events, one canceled event, one historical event, and one upcoming unlisted event, plus empty,
full, and final-seat examples. Existing demo profiles can host events in different cities.
Cities/street names are Montenegro-inspired; venues and bookings are fictional.

Event dates are generated relative to the page-load date in UTC. The core examples remain
upcoming after reload; one deliberately uses a past offset. Dates remain stable within the
runtime, and the API evaluates upcoming/available status at request time. Bundled illustrations
in `frontend/public/images/` cover role-playing, trading cards, board games, and social deduction.
No remote image service or real HTTP API is used. Local images have alt text and a fallback
if an image fails. IDs in shared references must match users/games fixtures.

A later backend should preserve these return payloads, error codes, and access semantics,
with durable storage, authenticated sessions, database foreign keys, unique attendance,
and transactional capacity enforcement. No HTTP server is implemented in Workshop 3.
