# RollCall product specification

## Product

RollCall helps people discover, organize, and join tabletop gaming events: Dungeons & Dragons,
Magic: The Gathering, Yu-Gi-Oh!, board game meetups, and social deduction games.
Serve new and experienced players on phones and desktops. Brand the product **RollCall**,
never "RollCall v2" in the UI.

## Delivery stages

Workshop 3 delivered the working frontend described below. Backend development is now
incremental: Milestone 1 adds the separate foundation; Milestone 2A adds geographic import
and backend search. Milestone 2B connects country/city selection to the frontend while
event CRUD, participation, users, games and authentication remain mocked.

## Workshop 3 scope

Frontend only, preserving React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, React Router,
and TanStack Query. Mock data lives in memory and resets on reload. No backend, database,
real authentication, payments, messaging, notifications, maps, or waitlists.

The foundation, discovery homepage, and frontend-only demo login/session are implemented.
Discovery and participation include Montenegro mock events, filters, illustrated cards,
complete details, and mutation feedback. Event creation/editing now use one reusable validated
form, with host-only edits and public/private visibility. Advanced administration, invitations,
and recurring events remain outside scope. `docs/entities.md` owns the detailed field,
validation, access, and future HTTP contracts; local types/APIs implement them.

## Feature ownership

| Domain | Responsibility |
| --- | --- |
| users | Public profiles and demo session selection; no credentials or private email |
| games | Read-only game catalog and categories |
| events | Discovery, details, creation, editing, removal, joining, and leaving |
| geography | Real read-only countries/city search, query caching and accessible selection controls |

An event references one organizer and one game by numeric ID. A user can organize many events
and attend many other events. Attendee IDs represent players: the organizer is separate and
does not consume a seat. Features never import each other, including types. Routes compose
features. Shared mock reference IDs validate relationships without cross-feature imports.

APIs return Promises of entities, arrays, or void and reject with common typed errors.
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
- Sign in: choose one of eight demo profiles, return to the intended page, and log out via
  navigation. No credentials are collected. Reload restores the selection in the current tab;
  blocked storage falls back to memory. This does not provide real authentication.

## Routes

| Path | Current behavior |
| --- | --- |
| `/` | Hero, search, category navigation, featured upcoming events, how it works |
| `/events` | Upcoming public mock events; card grid, title/country/city/game/availability controls, category URLs, reset |
| `/events/:eventId` | Complete details, host/game queries, session-aware join/leave, success/error feedback and missing-event recovery |
| `/events/new` | Signed-in creation form; success navigates to the new event |
| `/events/:eventId/edit` | Host-only prefilled editor using the same form; success returns to updated details |
| `/login` | Demo profile selection with loading, empty, error, and pending states |
| `*` | Not-found fallback |

All routes share responsive RollCall navigation and current login state. Anonymous visits to
create/edit redirect to login, as does joining an event. Login accepts only safe internal
`returnTo` paths and returns there; users explicitly retry joining after login. Logout updates
all session consumers and a protected page redirects to login. Route guards simulate a signed-in
session only; API organizer/capacity/access rules remain authoritative within the mock.

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

Vite development/preview proxies `/api` to the configured Fastify origin. Browser code has
no Supabase credentials. The frontend builds without a running backend; location failures
show errors/retry and never masquerade as loaded catalog data. Keep themes and existing
journeys intact. Real accounts, persistent events, invitations and uploads remain out of scope.

See [location UI](docs/location-ui.md) for contracts, setup and migration considerations.
