# RollCall product specification

## Product

RollCall helps people discover, organize, and join tabletop gaming events: Dungeons & Dragons,
Magic: The Gathering, Yu-Gi-Oh!, board game meetups, and social deduction games.
Serve new and experienced players on phones and desktops. Brand the product **RollCall**,
never "RollCall v2" in the UI.

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

An event references one organizer and one game by numeric ID. A user can organize many events
and attend many other events. Attendee IDs represent players: the organizer is separate and
does not consume a seat. Features never import each other, including types. Routes compose
features. Shared mock reference IDs validate relationships without cross-feature imports.

APIs return Promises of entities, arrays, or void and reject with common typed errors.
TanStack Query wraps reads; mutations invalidate event list/detail caches. Explicit mock
actors simulate permissions and provide no authentication or security. Current-user state is
cached with TanStack Query and the selected demo user ID is stored in sessionStorage for this tab.

## Intended journeys

- Discover: upcoming scheduled public events, title search, city/game/open-seat filters,
  category links from the homepage, reset controls, and loading/empty/error states.
- Inspect: host and game names, full schedule/address, tags, minimum age, visibility,
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
| `/events` | Upcoming public Montenegro events; card grid, title/city/game/availability controls, category URLs, reset |
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

The shared form covers title, description, game, city, venue, address, local start/end date-time,
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
