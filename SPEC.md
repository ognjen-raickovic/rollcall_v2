# RollCall product specification

Public `/about` and `/contact` pages describe the product and available contact options.
Footer links expose these pages; the logo provides homepage navigation without a duplicate
Discover item. Contact uses the owner-approved public support email
`rollcallsupport@gmail.com` through a mail link, without a messaging backend. My Profile has
one page h1, and Back navigation reuses the shared primary Button.

The current profile-editor follow-up implements a single-column tabbed editor, draft-only
game changes with an atomic owner-only Save endpoint (migration 21), inverted Back buttons
and consistent UTC account dates. Account deletion stays disabled pending the independently
reviewed security and retention requirements. See [profiles](docs/profiles.md).

## Product

Current navigation/discovery work adds an account-icon menu, active UUID My Events,
global database filters/sorting and a top-left auth return link. Migrations 19–20 are
local-only pending approval. Public discovery stays public/scheduled; cancelled private
relationships are available only through authorized My Events. Deletion and username
recovery remain separately gated/deferred. See [implemented scope](docs/navigation-discovery.md).

The account experience separates public My Profile from private Account Settings,
with shared accessible logout confirmation. Account deletion remains design-only;
see [account experience](docs/account-experience.md) and its separate approval proposal.
That account layout milestone introduced no profile API, RLS, role, Storage or migration
changes. The later auth-casing follow-up below adds only a safe username projection and
the reviewed forward registration schema change, preserving those security boundaries.

Current registration preserves username casing with case-insensitive uniqueness and required private DOB for new
accounts. Legacy accounts are preserved; ordinary display names remain editable. No
event-age eligibility is added. See [registration contract](docs/registration.md).
The operator reports migration 17 applied; case preservation requires separately approved
forward migration 18 and the existing backend operation capability. See [auth experience](docs/auth-experience.md);
hosted application/security acceptance remains pending. New launchers start both local
services or use isolated application staging configuration without operator-file access.

RollCall helps people discover, organize, and join tabletop gaming events: Dungeons & Dragons,
Magic: The Gathering, Yu-Gi-Oh!, board game meetups, and social deduction games.
Serve new and experienced players on phones and desktops. Brand the product **RollCall**,
never "RollCall v2" in the UI.

## Delivery stages

Milestone 6B-1 prepares application hosting only: Vercel static frontend with a same-origin
API rewrite, Render compiled Fastify with maintenance enabled, separate environment placement
and focused local hosting checks. No application deployment is performed. The operator reports
6A-2 database/reference-data/key provisioning; hosted Auth/security acceptance, deliberate
verified-account/superadmin setup and SMTP remain incomplete. Public release requires those
gates and explicit approval. See [hosting procedure](docs/application-hosting.md).

Current delivery is Milestone 5B-2B; see docs/account-suspensions.md. Earlier sections record historical boundaries.

Milestone 6A-1 adds hosted staging preparation only: an offline migration inventory,
explicitly gated operator catalog/geography/key/bootstrap procedures and a
[rollout guide](docs/hosted-supabase-staging.md). It does not deploy or alter hosted resources.
The rebased source includes the complete 5B-2B milestone; staging preparation preserves its
runtime and migration security prerequisites. 6A-2 performs separately
approved hosted setup; 6B finalizes frontend/backend hosting and origins.

## Current Milestone 4D: persistent event covers

Hosts can select JPEG/PNG/WebP source images up to 3 MiB through the existing form picker.
The server verifies extension, MIME and decoded content, rejects corrupt/animated/unsupported
images, limits source dimensions/pixels and re-encodes metadata-free WebP within 1600px.
Objects persist in one private `event-covers` bucket under server-generated UUID paths.
Normal event JSON writes cannot attach arbitrary paths or clear an existing cover.

Creation saves the event first, then uploads its optional cover. A failed image request
preserves the entered form and saved event UUID, explains partial success, and provides
Retry cover/View saved event actions. Retry reuses the saved event. Hosts can replace or
remove covers; old objects become removable only after a safe association change.
Default game illustrations remain available in forms, homepage/cards and details.

Storage RLS requires both verified event ownership and a server-only operation capability
for reserved-path writes. Public/unlisted reads follow event access; private covers require
the host/current participant. Only backend-authorized requests may sign URLs, for 60 seconds;
ordinary users cannot bypass that limit by signing directly. Existing URLs may remain usable
for their remaining lifetime after visibility/membership changes. No unrestricted service-role
client or public bucket is introduced.

Viewer-specific cover queries refresh active access after 45 seconds, retain nothing when
inactive and are cleared on auth transitions, relevant mutations and private departure.
No signed URL or image draft is stored persistently in the browser. Image failures fall back
to the standard illustration with bounded refresh behavior. Numeric demo covers remain isolated.

An additive migration configures the bucket, checked RPCs and a protected cleanup manifest.
Replacement/removal/deletion queue retired paths; supported Storage operations remove files.
Bounded retries handle partial failure and abandoned reservations, without a global scanner.
Only local Supabase was modified. No invitations, administration or deployment is included.
See [cover implementation](docs/event-covers.md) and [verification](docs/event-cover-verification.md).

Workshop 3 delivered the working frontend described below. Backend development is now
incremental: Milestone 1 adds the separate foundation; Milestone 2A adds geographic import
and backend search. Milestone 2B connects country/city selection to the frontend while
event CRUD, participation, users, games and authentication remained mocked. Milestone 3A
now adds real Supabase Auth and verified backend identity. Milestone 3B adds real profiles,
private optional age information and per-game experience, keeping event/demo mocks separate.
Milestone 4A implements persistent backend event APIs; the frontend continues using mocks.
Milestone 4B adds real transactional attendance and participant-aware backend details.
Milestone 4C-1 connects the React homepage, discovery and details to real event reads.
Milestone 4C-2 connects real event creation/editing/deletion and participation below.

## Milestone 4C-2: real frontend event actions (historical delivery)

`/events/new` requires a verified real account; `/events/:eventId/edit` additionally requires
the returned viewer to be the UUID event host. Both reuse the shared form presentation,
real games catalog and country/city picker. Strict write DTOs send title, description,
gameId, selected cityId, optional venue, private address, ISO schedule, capacity, minimumAge,
experienceLevel, EUR price, curated tags and visibility. Ownership, country and attendance
are server-derived. Default category illustrations replace upload controls on real forms;
custom browser covers remain demo-only until Milestone 4D.

Local picker times convert to ISO instants; invalid calendar/DST-gap values are rejected.
Unchanged edit timestamps preserve the original instant and precision. Inline errors cover
required fields and backend 400/409 fields; failed saves retain drafts. Refetches never
overwrite an entered draft. Successful creates/updates navigate to validated UUID details.
Private/unlisted creations remain accessible by the host's direct link and absent from discovery.

Hosts can delete through a keyboard-accessible confirmation explaining participation removal.
Failure keeps the dialog open; acknowledged 204 removes cached details, refreshes discovery
and navigates there with confirmation. Real eligible accounts join/leave using authenticated
attendance mutations; anonymous visitors are sent to login. Counts/membership come from
server responses, with no optimism, age/experience gates or private-code admission.

Viewer-specific mutation controllers capture the initiating account and abort on identity
changes. Cache effects/navigation recheck identity, cancel stale reads and refresh public
discovery/homepage. Leave hides the address during the request and after acknowledgement;
ambiguous failures hide it until retry or page reload. Private departures navigate safely
to discovery. Account changes/logout discard protected query and inactive mutation data.
Numeric demo controllers/caches remain separate under explicit development opt-in.

The existing backend, grants/RLS and schema remain unchanged. No Storage, codes, admin
features, migrations, remote operations or deployment are part of this milestone. See
[action verification](docs/event-actions-verification.md) for executed checks and limitations.

## Milestone 4C-1: real frontend event reads (historical delivery)

Homepage featured events and `/events` read persistent public events, with title, actual
country/city/game IDs, category and open-seat filters. Discovery uses bounded backend cursor
pages and an accessible Load More action; filter URLs/back/forward remain supported and
filter changes restart pagination. Category filtering applies to loaded chronological pages
and retains Load More until remaining backend pages are exhausted. Counts describe loaded
matches, never invented community activity or an unbounded total. Empty/error/retry states
are honest; unavailable services never trigger a mock fallback.

`/events/:eventId` validates UUIDs and renders actual game/host/location/schedule/tags/
experience/price/capacity plus viewer state. Dedicated DTOs remain separate from numeric
demo types. Only matching authenticated hosts/current members receive protected addresses;
public cards/metadata omit them. Details carry real session tokens only to the configured
API origin, verify viewer identity and use account-aware keys. Auth transitions remove old
queries before new account state; abort/post-response checks prevent stale protected data.

The existing layout, default illustrations and light/dark tokens are preserved. Summary
cards omit price because the discovery contract does not contain it. Detail actions and
hosting/editing routes originally explained that mutations awaited 4C-2; they never called mock
mutations for UUID records. Numeric fixtures/forms/attendance remain explicitly isolated at
development-only `/demo/events/*` with opt-in and clear nonpersistent labels. Public routes
never merge them with real records. No Storage, codes, admin controls or backend changes
are added. See [frontend verification](docs/event-frontend-verification.md).

## Milestone 4B: persistent attendance and capacity

Verified Supabase UUID accounts join/leave through POST/DELETE
`/api/events/:eventId/attendees/me`. Both return safe JSON attendance summaries with
eventId, hasJoined, capacity, participantCount and availableSlots. Actors are never accepted
from client data. Public/unlisted scheduled future events permit participation; hosts cannot
occupy seats. Current private participants can repeat join or leave, but outsiders cannot
join private events. Claimed experience and minimum age remain guidance, without eligibility
checks. No codes, invitations or role overrides are introduced.

PostgreSQL locks the event, checks current time/state, then changes the existing membership
table using its unique key and counter triggers. Concurrent joins cannot overbook; duplicate
join/no-member public leave are no-ops and preserve timestamps. Timing/status restrictions
apply before no-op checks. Private leave removes detail/address access; subsequent requests
return 404, including repeat leave. Capacity edits serialize with attendance on the event row.
Counter and required-location triggers run with narrowly scoped non-bypass privileges; raw
client membership/event/location table access remains closed.

All event details now include viewer userId/isHost/hasJoined. Only hosts/current participants
receive the address; private details require one of those relationships. Anonymous/unrelated
viewers never receive addresses or participant-private fields. Viewer responses are no-store
and vary on Authorization. Discovery stays public, scheduled and viewer-independent.

React attendance/events remain numeric mocks until 4C. No frontend API switch, Storage,
administration or private admission is included. See [event contracts](docs/events-api.md)
and [attendance verification](docs/attendance-verification.md).

## Milestone 4A: persistent event backend API

Fastify provides PostgreSQL-backed `GET /api/events`, `GET /api/events/:eventId`,
`POST /api/events`, `PATCH /api/events/:eventId` and `DELETE /api/events/:eventId`.
Discovery returns safe public/scheduled summaries in enabled ME/RS/BA/HR countries,
with title/country/city/game/date/availability filters and bounded chronological cursor
pagination. Country derives from city. Default covers use existing local game illustrations;
custom cover paths, URLs and data URLs are rejected until Storage integration.

Creation requires a real verified UUID account. Updates/deletion require the verified host,
with no admin override. Public/unlisted detail responses omit protected addresses; private
details and all exact addresses are host-only, even for existing participants. Inaccessible
and missing events return the same 404. Strict payloads reject client actors, host changes,
attendance counters and privileged fields. PostgreSQL validates final merged fields and
applies event/address changes atomically; edits preserve attendance. Hard deletion cascades
event locations/memberships while preserving referenced profiles, games and geography.

Runtime clients remain unprivileged. Raw event/location/attendance tables stay closed to
clients; checked functions use explicit grants, owner RLS and a non-bypass executor.
No remote operations, resets or geographic imports are needed. See
[event API contracts](docs/events-api.md) and [verification](docs/events-api-verification.md).

React event APIs, numeric IDs, forms, covers and demo participation remain unchanged mocks.
Real attendance is Milestone 4B, frontend UUID integration 4C, Storage 4D, and private
invitation codes/role-authorized access Milestone 5. No such features are delivered in 4A.

## Milestone 3B: profiles and per-game experience

Registered accounts have one Auth-linked UUID profile. Users can edit their own display name,
optional biography, country/city and optional private self-declared birth year. Creation date
and UUID are read-only. Country/city selection reuses the real geography catalog and requires
an actual suggestion for a chosen city; a country without a city is valid. New accounts start
with the existing safe placeholder and a friendly incomplete-profile experience.

Profiles expose selected games from the existing database catalog, with independently
self-declared beginner/intermediate/veteran experience. Users can add/change/remove their own
associations, one row per account/game. Changes persist in PostgreSQL. Claimed experience is
not verified and never gates attendance in this milestone. Event experience/tag rules stay intact.

Own-profile endpoints derive ownership from verified Supabase tokens. Public profile responses
contain only display name, biography, location, account dates and selected games/experience;
they never expose email, birth year, age-declaration timestamps, roles or privileged metadata.
Focused grants/RLS enforce the same ownership and field restrictions through the Data API.
Public profiles are `/users/:userId`; own view/edit are `/profile` and `/profile/edit`.

Real profile/game APIs remain separate from numeric demo identities/catalogs. Frontend event
CRUD and attendance still use mock data and require explicit development demo mode. This
3B delivery added no persistent events, profile pictures, codes, invitations or administration;
the separate 4A event backend is described above.
See [profile implementation](docs/profiles.md) for contracts, setup and verification.

## Milestone 3A: real authentication

The users feature owns email/password registration, login/logout, email confirmation/resend,
password recovery/reset and supported Supabase PKCE session persistence/automatic refresh.
Routes are `/login`, `/register`, `/forgot-password`, `/reset-password` and `/auth/callback`.
Forms validate email and password confirmation, display safe errors/status and preserve the
existing responsive dark/light design. Passwords are sent only to Supabase Auth, never logged
or stored in application tables.

Fastify verifies Supabase access tokens through the supported `getClaims` mechanism plus
issuer/audience/expiration/UUID checks. Protected `GET /api/me` returns only safe UUID/email
identity; missing, expired or invalid tokens return 401. Geography stays publicly accessible.
Registration initializes only a minimal UUID-linked profile with a fixed placeholder name,
without metadata-derived roles, private age or geographic onboarding. Existing RLS/grants remain.

Real accounts are independent of numeric demo users. Explicit development-only demo mode
preserves legacy mock event demonstrations at `/demo/login`; production builds cannot select
fixture profiles. A real account cannot become a mock host or participant. Event changes are
not persisted, and the UI must state that limitation rather than claiming real event participation.

Milestone 3B above implements profile editing and per-game experience. Milestone 4 replaces
numeric event/actor dependencies with explicit UUID adapters and persistent authorized APIs.
Private codes, uploads, administration and deployment remain outside this milestone.
See [authentication](docs/authentication.md) for local setup and identity/security boundaries.

## Workshop 3 scope (historical frontend delivery)

Frontend only, preserving React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, React Router,
and TanStack Query. Mock data lives in memory and resets on reload. No backend, database,
real authentication, payments, messaging, notifications, maps, or waitlists.

The original foundation, discovery homepage and demo login/session were delivered in Workshop 3.
The demo remains available only through explicit development opt-in; real login is described above.
Discovery and participation include Montenegro mock events, filters, illustrated cards,
complete details, and mutation feedback. Event creation/editing now use one reusable validated
form, with host-only edits and public/private visibility. Advanced administration, invitations,
and recurring events remain outside scope. `docs/entities.md` owns the detailed field,
validation, access, and future HTTP contracts; local types/APIs implement them.

## Feature ownership

| Domain    | Responsibility                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------- |
| users     | Real Auth, UUID profiles/private age/game experience, plus separate numeric mock profiles/demo sessions |
| games     | Read-only database profile catalog alongside the unchanged mock event catalog and categories            |
| events    | Discovery, details, creation, editing, removal, joining, and leaving                                    |
| geography | Real read-only countries/city search, query caching and accessible selection controls                   |

An event references one organizer and one game by numeric ID. A user can organize many events
and attend many other events. Attendee IDs represent players: the organizer is separate and
does not consume a seat. Features never import each other, including types. Routes compose
features. Shared mock reference IDs validate relationships without cross-feature imports.

Mock APIs return Promises of entities, arrays, or void and reject with common typed errors.
TanStack Query wraps reads; mutations invalidate event list/detail caches. Explicit mock
actors simulate permissions and provide no authentication or security. Current-user state is
cached with TanStack Query and the selected demo user ID is stored in sessionStorage for this tab.

## Intended journeys

- Discover: upcoming scheduled public events, title search, country/city/game/open-seat filters,
  category links from the homepage, reset controls, and loading/empty/error states.
- Inspect: host and game names, full schedule, protected exact-address display, tags, minimum age, visibility,
  experience level, price, participant count, and remaining seats or a clear Full status.
- Organize: create valid events, then edit only events you organize. Host-only removal is
  available in the mock API; no removal action is exposed in this frontend MVP.
- Participate: join upcoming scheduled events with space; leave before they start.
- Demo sign in: in explicitly enabled development mode, choose one of eight mock profiles,
  return to the intended page, and log out via
  navigation. No credentials are collected. Reload restores the selection in the current tab;
  blocked storage falls back to memory. This does not provide real authentication.

## Routes

| Path                    | Current behavior                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/`                     | Hero, search, category navigation, featured upcoming events, how it works                                        |
| `/events`               | Upcoming public mock events; card grid, title/country/city/game/availability controls, category URLs, reset      |
| `/events/:eventId`      | Complete details, host/game queries, session-aware join/leave, success/error feedback and missing-event recovery |
| `/events/new`           | Signed-in creation form; success navigates to the new event                                                      |
| `/events/:eventId/edit` | Host-only prefilled editor using the same form; success returns to updated details                               |
| `/login`                | Real Supabase email/password login; links to recovery, registration and optional development demo                |
| `/register`             | Email/password/confirmation registration and email-confirmation guidance                                         |
| `/forgot-password`      | Neutral recovery-email request feedback                                                                          |
| `/reset-password`       | Recovery-session password/confirmation form                                                                      |
| `/auth/callback`        | PKCE email-confirmation callback and account verification feedback                                               |
| `/demo/login`           | Explicit development-only numeric demo selection; unavailable in production builds                               |
| `*`                     | Not-found fallback                                                                                               |

All routes share responsive RollCall navigation and current real/demo login state. Anonymous
protected actions lead to login. A real account sees the current mock-event limitation;
only explicit development demo identity supplies a numeric event actor. Safe internal
`returnTo` paths preserve the intended destination; users explicitly retry joining after
demo login. Logout updates session consumers. Mock route guards and organizer/capacity/access
rules simulate permissions; they do not authorize real persisted event data.

Events may be public, private, or unlisted. Private events are absent from discovery and
readable only by their host and existing participants. No new players can join private events;
existing players may leave, after which they lose read access. Unlisted events retain their
previous link-access behavior. There is no invitation or private-event administration UI. Minimum age is
displayed as event guidance, without collecting birth dates or adding age verification.
Join/leave updates the detail cache immediately and refreshes affected lists. Hosts occupy
a separate seat, full-table participants can still leave, and duplicate joins never add a
second seat. Discovery defaults are applied by API filters, not by reading fixtures in UI code.

## Event management

The shared form covers title, description, game, country/selected city, optional venue, address, local start/end date-time,
capacity, minimum age, tags, visibility, experience level, and EUR entry price. The host is set
from the current demo user. The game determines a local cover illustration on creation or a
game change unless the host supplies an optional custom cover. Create and edit accept JPG,
PNG, or WebP files up to 3 MiB, with immediate preview, replacement, removal, and clear errors.
The browser resizes covers to a maximum 1600px edge and encodes them as bounded data URLs
through the existing imageUrl field. Custom covers survive game changes and appear on cards
and details. Removing one restores the selected game's default. Covers remain in mock memory
only and reset on full reload; no external storage, image service, or upload HTTP call is added.

Form/API validation share entity constraints, including future start, end after start, integer
capacity 1–100, and capacity at least current attendance. Tags are optional selections from
`EVENT_TAGS` in the events feature: Beginner friendly, Veterans only, Casual, Competitive,
One-shot, Campaign, Bring your own deck, and Equipment provided. The accessible checkbox
dropdown accepts at most six unique tags and displays removable chips. Arbitrary tags and
the Beginner friendly/Veterans only combination are rejected by the API.

Experience level governs tags: Beginner friendly is allowed for all-levels/beginner, while
Veterans only requires experienced. Changing experience removes incompatible selected tags
with a status message; it never silently changes the experience level. Editing preserves
existing valid tags. The form converts local picker values to ISO instants.
Errors are inline and entered values survive failed saves. Loading game catalogs, empty/error
catalogs, missing events, unauthorized edits, and pending saves have explicit states.

Only signed-in demo users can create; only the host can open the editor or update the event.
Editing preserves organizer, attendance, creation timestamp, and event status. Saving a canceled
event keeps it canceled. Success navigates to details with a confirmation. Create/update cache
the returned event for the actor and invalidate discovery/detail queries. Public scheduled
future events appear when they match active filters; private and unlisted events do not.

The ten mock events cover Podgorica, Niksic, Budva, Kotor, Bar, Cetinje, Herceg Novi, and Tivat.
Venues are fictional. Core dates roll forward on reload to keep the demo usable; past,
canceled, unlisted, empty, full, and final-seat cases are retained for validation.

## Design

Take inspiration from Meetup's discovery hierarchy: useful filters, scannable events, clear
dates/locations, and a prominent primary action. Use charcoal/navy surfaces, restrained purple
accents, and clean typography. `frontend/DESIGN.md` owns guidance and `frontend/src/index.css`
owns tokens. The homepage uses a confident hero, code-native tabletop illustration, category
tiles, and responsive event cards. Dark remains the default. A matching semantic light
palette is selectable from the navbar, and `rollcall.theme` in localStorage restores the
choice on reload. A small head script applies it before the app starts; blocked storage
falls back to the current page's preference. Session, event, and theme state are independent.
No theme colors are hardcoded in components. The desktop form/sidebar align at the top;
required markers remain without the former introductory paragraph.

## Acceptance and collaboration

- Replace listings with users, games, and events while retaining feature boundaries.
- Implement documented validation, permissions, capacity, idempotent attendance, and isolated
  mock responses (callers cannot mutate stored records through returned references).
- Keep Codex and Claude instructions consistent and preserve `.claude/` tooling.
- Use separate GitHub feature branches and PRs; coordinate edits to shared files.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` before handoff; report checks and limits.
- Follow the existing UI review workflow for page work. No commits, pushes, or merges without approval.

## Backend Milestone 1

Use Node.js with TypeScript, Fastify, Zod, Supabase PostgreSQL and the existing pnpm
workspace. Supabase Auth is the chosen future identity provider and Supabase Storage is
the chosen future cover provider; real login, uploads and event endpoints are not part of
this milestone. Preserve the complete Workshop 3 frontend, its numeric mock IDs and forms.

The foundation includes:

- A modular backend package, validated server configuration, consistent errors, automated
  tests and root commands that also retain the existing frontend development workflow.
- `GET /health` for API process liveness, `GET /api/countries` for enabled countries, and
  `GET /api/cities?country=ME&q=...&limit=4` for bounded database-backed place suggestions.
- Supabase CLI local configuration, version-controlled SQL migrations, explicit grants/RLS,
  database tests and a small, explicitly incomplete development geography seed.
- Relational countries, cities, profiles, games, per-game self-declared user experience,
  events and attendance; separate protected storage for private profile details, event
  addresses and authorization roles. Country derives from an event's selected city.

Initial enabled countries are Montenegro (ME), Serbia (RS), Bosnia and Herzegovina (BA),
and Croatia (HR). Countries are rows, not a frontend enum. Place storage supports many
thousands of settlements, stable external source identifiers and indexed normalized-name
search. Milestone 2A implements reproducible imports from GeoNames; frontend country/city
autocomplete is separate Milestone 2B work. The development seed and the source dataset
must never be described as perfectly complete.

Database profiles use actual Supabase Auth UUIDs. Events also use UUIDs; catalog and
geography keys are numeric. Real event models retain the existing validation rules with
an optional venue, a required protected in-person address and a selected city ID.
The host does not occupy a player seat; unique attendance and serialized capacity checks
provide database foundations for later transactional join/leave endpoints. The current
frontend's mock model and HTTP-shaped contracts remain separate until integration.

For Milestone 1 the backend uses Supabase's Data API with an unprivileged publishable or
legacy anon key, explicit grants and RLS. No service-role key is needed. Later endpoints
must verify Supabase identity and use an isolated request-scoped user context; a client
must never choose its own actor or role. Age is private, self-declared guidance, not a
verified qualification. Game experience is independently self-declared per game.

Public events are discoverable. Unlisted events will remain accessible by direct link
without being treated as a privacy guarantee. Private events are hidden until authorized;
future room-code validation/joining must be rate-limited, use cryptographic generation,
hash verification and server-managed encrypted retrieval for authorized hosts/admins.
Code rotation/revocation, role management, admin interfaces and invitation workflows are
planned only. Only authorized superadmins may eventually promote/demote admins.

See [backend architecture](docs/backend-architecture.md),
[database schema](docs/database-schema.md), and [roadmap](docs/backend-roadmap.md) for the
implemented foundations, access model and next milestones. No remote project changes,
deployment, commits, pushes or merges are authorized by this milestone.

## Backend Milestone 2A: Balkan geographic data and search

Use the ME, RS, BA and HR GeoNames country extracts, with the documented populated-place
feature-code allowlist, stable GeoNames identifiers and CC BY 4.0 attribution. Import cities,
towns, villages and eligible smaller settlements without a population threshold. Historical,
abandoned, destroyed, grouped and city-section records are excluded as documented in
[geographic import](docs/geographic-import.md). Source accuracy/completeness is not guaranteed.

The import is an explicit local maintenance operation: downloaded archives/text are ignored,
inputs have SHA-256 checksums, records are validated, and per-country transactions retain
internal city IDs and application references. Reruns update by source identity; known seed
adoption must be unambiguous. No city is deleted merely because it disappears from a source
extract. No runtime API client gains write privileges.

Search remains `GET /api/cities?country=ME&q=...&limit=4`, with mandatory country filtering,
strict validation and the existing response fields. Additive country/administrative-code fields
help distinguish same-name places. Search uses canonical and source alternate names, case/
accent normalization and common Serbian Latin/Cyrillic forms. Exact/prefix matches rank ahead
of substring matches; substring search begins at three normalized characters. Empty input
favors populous places. The default remains four results and the hard maximum twenty.

Database migrations add aliases/source administrative metadata and suitable prefix/trigram
indexes while preserving grants/RLS. Verify real import counts, rerun identity stability,
country isolation, search behavior and query performance on the loaded dataset; do not infer
those results from schema definitions alone.

Milestone 2A does not change React routes/forms, mock events, login, styles or themes. It does
not add authentication, event HTTP operations, private room codes, deployments or remote database
changes. The following Milestone 2B adds country selection, debounced bounded city suggestions,
selected city IDs and clearing an incompatible selection through feature API layers.

## Milestone 2B: frontend country and city integration

The frontend geography feature reads enabled countries and bounded city suggestions from
Fastify. Country rows/IDs and selected city IDs are API values, never a hardcoded browser
catalog. City searches are debounced about 250 ms and cached by country/query; stale
requests are canceled or ignored. Focus opens up to four suggestions, with loading, empty,
error and retry states. Arrow keys move the active result, Enter selects and Escape closes.
Administrative labels distinguish same-name places, and GeoNames attribution remains visible.

Both event forms require confirmation of a real city suggestion. The selected shared
`LocationReference` stores its integer city/country IDs and display metadata alongside
the existing event `city` label. Country/text changes invalidate selection immediately.
Legacy fixtures retain their known ME country and city strings without invented IDs;
editing one requires confirming a suggestion. Direct legacy mock API callers remain
compatible, but this is not database FK validation. Event/user IDs remain numeric mocks.

Venue is optional everywhere: blank becomes an empty string; a provided venue must have
2–120 trimmed characters. Cards/details omit absent venue text and stray separators.
Address remains required, but the exact value renders only for the host and current
participants. Because mock objects stay in browser memory, real privacy still requires
future server-side authorization and safe response DTOs.

Discovery combines country/city with existing title/game/category/availability filters.
Country-only filtering works. Applied filters use URL parameters, reset removes location
state, and Back/Forward restores it. Reference-backed events filter by stable city ID;
unresolved ME fixtures use a documented normalized country/name compatibility bridge.
Homepage location search uses the same controls and does not advertise foreign fixtures
that do not exist. Users may create events in any enabled supported country during the
current page runtime; refresh still resets all mock event changes.

Vite development/preview proxies `/api` to the configured Fastify origin. Milestone 2B
required no browser Supabase configuration; 3A adds only public Auth URL/key configuration.
The frontend builds without a running backend; location failures
show errors/retry and never masquerade as loaded catalog data. Keep themes and existing
journeys intact. Real accounts were outside 2B and are implemented in 3A above; persistent
events, invitations and uploads remain outside the current scope.

See [location UI](docs/location-ui.md) for contracts, setup and migration considerations.

## Milestone 5A

Milestone 5A implements encrypted host-only private invitations, authenticated code admission, durable account limits and connection-IP throttling. Admission/rotation share event locks and existing attendance counters. Private discovery/address/cover rules remain intact. See [scope and verification](docs/private-invitations.md); administrative roles remain 5B.

## Milestone 5B-1

Milestone 5B-1 implements user/admin/superadmin permissions from private trusted assignments, local first-superadmin bootstrap, bounded account lookup, user/admin transitions and atomic append-only audits. Admins receive only a landing page; superadmins manage roles/audits. Existing private ages, event host controls, invitation secrets, addresses and Storage permissions gain no administrative override. See [contracts and verification](docs/administration.md). Moderation is 5B-2.

## Milestone 5B-2A

Milestone 5B-2A implements authenticated event reporting, database-enforced open-report deduplication/account throttling, moderator review, dismissal and atomic reported-event cancellation. Private-event reports require the host/current participant; moderator context excludes reporter identities, protected addresses, covers and codes. Host reactivation after moderation is blocked, while ordinary editing/deletion otherwise remains host-only. See [policy and verification](docs/event-moderation.md). Account suspensions, user reports, invitations overrides and deployment remain outside scope.

## Milestone 5B-2B

5B-2B implements active/suspended account state separately from roles, active-moderator policy, audited indefinite suspension/reinstatement, central HTTP and SQL enforcement, protected Storage checks, account-access UI and safe suspended-user public browsing. Data is retained and existing memberships still consume seats. Auth bans/deletion, user reports, appeals, expiry, notifications and hosted deployment remain outside scope. See [implementation and verification](docs/account-suspensions.md).
