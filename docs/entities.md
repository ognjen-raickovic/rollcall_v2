# RollCall entities and API contract

Shared contract for Workshop 3 mocks, Milestone 2B location integration and the backend foundation.
Feature types live in `frontend/src/features/<domain>/types.ts`; APIs and fixtures live in
that feature's `api/`. Users and games are read-only in the frontend scope; mock events
support CRUD plus attendance. Geography alone uses real HTTP. The backend model intentionally
differs where stated below.

## Backend Milestones 1 and 2A: implemented API

Only the following HTTP endpoints are implemented. All other HTTP paths later in this
document describe the Workshop 3 mock-shaped intended contract, not existing server routes.

| Method/path | Result | Access |
| --- | --- | --- |
| `GET /health` | Process liveness response, independent of the database | Public |
| `GET /api/countries` | `{ id: number, isoCode: string, name: string }[]` for enabled countries | Public, geography-only RLS/grants |
| `GET /api/cities?country=ME&q=pod&limit=4` | `CitySuggestion[]` | Public, geography-only RLS/grants |

`CitySuggestion` contains `id: number`, `countryId: number`, `name: string`,
`administrativeDivision: string | null`, `latitude: number | null`, and
`longitude: number | null`. Milestone 2A adds `countryIsoCode: string`, `countryName: string`,
`admin1Code: string | null`, and `admin2Code: string | null`; existing fields remain.
No address, private profile data or account role is returned. The alias catalog is searched
on the server rather than downloaded with every suggestion.
Country/city IDs are database references, not frontend fixture IDs.

City queries are strict: required trimmed two-letter country code, normalized to uppercase;
optional trimmed `q` of 0–80 characters; optional integer `limit` between 1 and the
configured maximum (hard cap 20; default result count 4). Repeated/unknown query parameters
are rejected. Empty `q` returns suggestions. The database normalizes case/diacritics and
uses canonical and source alternate names. Exact matches rank first, then prefixes, then
substrings for queries of at least three normalized characters. One/two-character queries
use prefixes only. Case/accents and common Serbian Latin/Cyrillic forms are normalized;
literal wildcard characters are not broad-match syntax. Country search is restricted to
enabled ME, RS, BA and HR rows. Disabled/unsupported/unknown countries and no matches return
`[]`; malformed country codes still return 400. Within each match rank, ordering is population
descending (null last), normalized name and ID. Empty input uses that prominence ordering
without a match rank. Results contain each city ID at most once.

Success returns arrays directly, without an envelope. Errors use
`{ code, message, fields: Record<string, string[]> }`: `VALIDATION_ERROR` (400),
`NOT_FOUND` (404), `DEPENDENCY_UNAVAILABLE` (503), and `INTERNAL_ERROR` (500).
Invalid upstream rows and unavailable Supabase calls fail safely rather than returning
mock fallback data. `/health` is liveness, not a database readiness guarantee.

## Backend model and transition

The database is defined by versioned migrations in `supabase/migrations/`; exact columns,
constraints, delete behavior and the ER diagram are in [database schema](database-schema.md).

| Entity | Database foundation | Difference from Workshop 3 |
| --- | --- | --- |
| Country | Numeric PK; unique ISO alpha-2 code, name, enabled, created timestamp | Relational country catalog; ME/RS/BA/HR seeded, no frontend enum |
| City | Numeric PK; country FK, canonical/ASCII/normalized names, optional administrative names/codes, coordinates/population, feature code/source ID/source modification date, created timestamp | Event/profile city is a selected ID; source upserts preserve internal IDs |
| City alias | Composite city/normalized-name PK; matching city/country FK, source name, normalized key and source label | Alternate names support server search without merging same-name places |
| Profile | UUID PK/FK to `auth.users`; display name, optional country/city, biography, timestamps | Real Auth identity replaces numeric demo IDs later; no credentials/roles/age in public DTOs |
| Private profile | Optional self-declared birth year and declaration timestamp in a protected table | Private, approximate age guidance; no birth date or verification |
| Account role | Protected profile relationship with `user`, `admin`, or `superadmin` | No arbitrary client role assignment or management endpoint |
| Game | Numeric PK; existing category/name/description/player guidance | Separate curated database catalog; no game write API yet |
| User game experience | Composite user/game relationship with `beginner`, `intermediate`, or `veteran`, timestamps | Independently self-declared for each game; not a verified qualification |
| Event | UUID PK; host UUID/game/city FKs, optional venue, schedule/capacity/experience/price/tags/age/visibility/status, future cover reference, timestamps | Country derives from city; the frontend retains numeric event IDs and adds a selected location snapshot alongside its city label |
| Event location | Required in-person address separated from public event fields, explicit public-sharing flag default false | Exact residential address is excluded from public reads by default |
| Event participant | Composite event/profile PK, attendance timestamp; host excluded | Many-to-many attendance with serialized capacity protection rather than an embedded ID array |

Only geography has Data API read grants in Milestones 1/2A. Other application tables have RLS
enabled and no client access until their future endpoints/policies are implemented and
tested. Auth/profile/event APIs are not available just because their tables exist.

Frontend integration must deliberately adopt UUID profile/event IDs and selected city IDs
through feature API adapters; never cast UUIDs to numbers or equate a numeric demo profile
with an Auth account. Keep catalog/geography numeric identifiers as IDs, not display names.
Milestone 2B changes only the frontend location adapter and optional venue. Future REST event/profile
DTOs must omit private age, roles, invitation secrets and exact addresses unless the
specific actor is authorized for an explicit protected response.

Existing host/attendance, capacity 1–100, future scheduling, EUR price, tag/experience and
visibility rules remain the basis for future endpoints. Venue is optional in the frontend
and backend model; an in-person address remains required in its protected relationship.
Supabase Storage is planned for covers, but no bucket, upload API or persisted image
transport exists in Milestone 1. Mock data URLs are never production database payloads.

Public discovery, direct-link unlisted access and private-code access are separate future
read/join contracts. Private event details and addresses must be withheld before
authorization. Codes will require cryptographic generation, rate-limited validation/joining,
rotation/revocation and separate server-managed encrypted retrieval plus verification hashes.
Ordinary participants never receive a code. No invitation workflow or role-management
endpoint is implemented now; see [authorization design](backend-architecture.md).

## Geographic data ownership and import contract

GeoNames country extracts provide eligible populated places for ME/RS/BA/HR. The importer
stores `external_source = 'geonames'` and the stable GeoNames ID separately from RollCall's
city ID. Source-backed rows retain their internal IDs on reruns. Only explicitly recognized,
unambiguous development seeds may be adopted into source identity; ambiguous matches remain
separate and are reported rather than merged automatically. Existing profile/event city
references and city creation timestamps are preserved.

Imports are local maintenance transactions, not public write endpoints. They validate all
four inputs before writing, use parameterized batches, retain source checksums and report
per-country counts. No city is removed because a new extract omits it. Aliases are additive;
manual aliases are not overwritten. Source name variants are not verified current names or
verified language labels. See [geographic import](geographic-import.md) for filters, exact
rerun commands, attribution, limitations and execution evidence.

## Milestone 2B frontend location contract

`geography` owns country/city HTTP response types, query hooks and controls. Events never
import geography. Routes compose the picker into event form/discovery render props, and
both features use `LocationReference` from `frontend/src/lib/location.ts`:

| Field | Type and constraint |
| --- | --- |
| `cityId`, `countryId` | Actual positive PostgreSQL integer IDs, 1–2147483647 |
| `countryIsoCode` | Two uppercase ASCII letters supplied by the country/city API |
| `countryName` | Trimmed display label, 2–100 characters |
| `cityName` | Canonical trimmed display label, 1–200 characters |
| `administrativeDivision` | Nullable region label, 1–200 characters when present |
| `admin1Code`, `admin2Code` | Nullable source administrative codes, maximum 20/80 characters |

The reference is a selection/display snapshot, not a duplicated geographic catalog or a
database relationship guarantee. Selecting a real suggestion sets it plus the existing
`city` label and `countryCode`. Forms require a non-null selection; free typing cannot
submit a valid location. Changing country or editing the city text clears the selection.
Legacy fixture editors retain the text as a hint and require the host to confirm a real
suggestion instead of guessing an ID from a potentially ambiguous name.

Countries come from `GET /api/countries`; searches use `GET /api/cities` with a mandatory
country code, debounced `q` and four results. Query keys include country/query and consume
abort signals, preventing stale country/query results from replacing current suggestions.
See [location UI](location-ui.md) for keyboard behavior, setup, URLs and limitations.

## Frontend mock event/user/game contract

The following sections continue to describe the functioning frontend demo. Their numeric
IDs, address responses and proposed HTTP-shaped operations are not grants or response
contracts for the new database. The backend transition above takes precedence for real data.

## Mock common conventions

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
  createdAt, or updatedAt. Strings are trimmed before validation. Failed mutations leave data unchanged.
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
| city | string | Required display label, 1–200 trimmed characters; equals selected `location.cityName` when a reference is supplied |
| countryCode | string, optional for legacy calls | Two uppercase ASCII letters; equals selected location country when both are supplied; existing fixtures explicitly use ME |
| location | LocationReference or null, optional for legacy calls | Actual selected IDs/display snapshot; required by current create/edit UI, optional only for mock compatibility |
| venue | string | Optional on create/update; omitted create values normalize to `''`; blank allowed, otherwise 2–120 trimmed characters |
| address | string | Required, 3–200 trimmed characters |
| startsAt | ISO timestamp string | Required, strictly in the future on create/update |
| endsAt | ISO timestamp string | Required, strictly after startsAt |
| capacity | number | Required integer 1–100; player seats, excluding organizer |
| attendeeIds | number[] | Assigned empty; unique existing users, excluding organizer; managed by join/leave |
| experienceLevel | ExperienceLevel | Required: `all-levels`, `beginner`, `experienced` |
| price | number | Required, EUR, 0–10000, maximum two decimal places; 0 means free |
| imageUrl | string or null | Required key; null, HTTP(S) URL up to 2000 characters, local `/images/<kebab-name>.(svg,webp,png,jpg)` path, or bounded JPG/PNG/WebP data URL in the mock only |
| tags | EventTag[] | Required; 0–6 unique canonical values from EVENT_TAGS; optional selection in the form |
| minimumAge | number | Required integer 0–99; 0 means all ages; informational event guidance |
| visibility | EventVisibility | Required: `public`, `private`, or `unlisted`; only public events enter discovery |
| status | EventStatus | Assigned `scheduled` on create; update may set `scheduled` or `cancelled` |
| createdAt | ISO timestamp string | Assigned on create, immutable |
| updatedAt | ISO timestamp string | Assigned on create and successful state changes |

`NewEvent` contains editable fields, excluding id, organizerId, attendeeIds,
status, createdAt, updatedAt; venue and transitional location/country fields may be omitted
by legacy mock callers. `UpdateEvent` is a nonempty partial NewEvent plus optional status.
Both reject unknown fields. In mock partial updates, undefined values are treated as omitted;
at least one defined field is required. Attendees cannot exceed capacity; reducing capacity below current
attendance returns 409. Canceling preserves attendance; an organizer may reschedule a canceled
future event by setting status back to scheduled. Updating validates the merged event, including
future start and end order. Past events remain readable and removable, but cannot be updated
unless the update moves their start into the future. Organizer, game, and attendees have no
cascade behavior because users/games cannot be deleted in this scope. Removing an event also
removes its embedded attendance.

`EventTag` and `EVENT_TAGS` live in `features/events/event-tags.ts`: `Beginner friendly`,
`Veterans only`, `Casual`, `Competitive`, `One-shot`, `Campaign`, `Bring your own deck`,
and `Equipment provided`. Values are exact and case-sensitive; arbitrary tags are rejected.
Beginner friendly and Veterans only are mutually exclusive. The former is allowed for
all-levels/beginner; Veterans only requires experienced. API updates validate the merged
tags and experience. The UI keeps experience authoritative, disables incompatible choices,
and removes selected incompatible tags with feedback when experience changes.

### Optional mock covers and backend handoff

The file control accepts JPG/JPEG, PNG, and WebP with matching extension/MIME/signature,
at most 3 MiB (3 × 1024 × 1024 bytes, presented as 3 MB in UI). The browser decodes the file,
resizes it without upscaling so the longest edge is at most 1600px, and encodes WebP at
0.82 quality (or the browser's supported canvas fallback). It releases decoded bitmaps and
canvas buffers after processing. Corrupt files and processing failures retain prior form
values and show errors. Saving waits for image preparation; unmounted forms ignore late results.

The resulting bounded `data:image/(jpeg|png|webp);base64,...` string travels through the
existing imageUrl field. Mock validation checks permitted MIME, base64 structure, decoded
size <= 3 MiB, and header signature. SVG data, blob URLs, oversized data, and arbitrary
schemes are rejected. Full image decoding happens in the browser preparation step.
There are no retained File objects, object URLs to revoke, image keys in browser storage,
network uploads, or external storage services. Cards/details render the same saved image.

Known bundled game covers represent the default. A form without a custom cover tracks
the selected game. Existing custom covers are prefilled and preserved across game changes
until replaced or removed; removing one restores the current game's bundled cover.
Custom images, like other event changes, reset on full reload.

Data URLs are a Workshop 3 mock representation, not a backend storage contract. Supabase
Storage is now the planned provider for a later backend milestone. Upload transport,
ownership, bucket policies and image lifecycle still require implementation; no bucket,
media endpoint or server persistence is added in Milestone 1. The frontend event imageUrl
remains a renderable string/null and its current preparation/preview behavior is unchanged.

### Access and attendance

Public/unlisted reads are public. Mock writes require `MockActor = { userId: number | null }` as the last
argument. Missing/null/unknown user is 401. Any known mock user can create. Only the organizer
can update/remove; a different known user receives 403. There is no global default user.
Exact address rendering is separately limited to the host/current participants. Anonymous
and non-participating viewers see a neutral address-sharing explanation, including public
or unlisted events. Mock API objects still contain the address in browser memory, so this
is a UI safeguard, not server-side privacy. A future event API must omit protected addresses
from unauthorized DTOs and enforce identity/attendance on the server.
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
| city | 0–200 characters; trimmed case/diacritic-insensitive display-label match; empty means all |
| country | Optional two-letter country code, normalized uppercase; filters selected-reference country or the legacy fixture's known country |
| cityId | Optional positive PostgreSQL integer city ID; selected references match by ID; unresolved ME fixtures may use the explicit country-plus-canonical-label bridge described below |
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
from query strings before validation. Category discovery is handled by route composition:
use the games catalog to choose matching game IDs; category is not a duplicated event field.

Milestone 2B discovery URLs use `country`, `cityId` and the selected canonical `city` label,
with optional display-only `region` context,
alongside existing search/game/category/availability parameters. Country changes clear both
city fields; reset clears all filters. Country-only filtering is valid. Browser navigation
restores applied URL state. Old city-string URLs remain compatible. For a legacy fixture
without a selected reference, city-ID filtering requires `country=ME` and a matching
normalized label; no fake ID is assigned. New reference-backed events use exact city IDs.
The fallback is a temporary demo bridge and cannot establish database identity or ownership.
URL-restored references are filter display state, not confirmed form selections or trusted
database identity. The event API does not receive `region` as an additional filter.

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
adapts local `datetime-local` picker strings to the same NewEvent
contract; it does not perform requests. Impossible dates/local times and missing, past, or
reversed schedules are rejected. End time remains required. Venue may be blank; provided
values retain their length validation. Both form routes require a confirmed geographic selection.
Capacity/age are integers; price is EUR with at most two decimals. The form validates capacity
against known attendance, and the API rechecks latest attendance, returning a 409 with an
inline `fields.capacity` message if a concurrent change makes the submitted capacity too low.

Form inputs include experience level and price so edits preserve those event details.
`event-covers.ts` owns defaults, custom-cover recognition, preparation, and data-URL checks.
The optional file input and curated tag selector share React Hook Form state across both routes.
Tags may be empty, otherwise canonical and unique, with a maximum of six and experience rules.

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

A later frontend/backend integration should preserve working journeys and compatible error
semantics while explicitly adapting the changed UUID/city/address model described above.
No HTTP server was implemented in Workshop 3. Backend Milestone 1 adds only the health/
geography server routes; event/profile/auth routes remain planned.
