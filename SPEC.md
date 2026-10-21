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
The current task completes event discovery and participation with Montenegro mock events,
filters, illustrated cards, complete details, and mutation feedback. Event creation/editing forms
and advanced administration remain outside scope. `docs/entities.md` owns the detailed field,
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
- Organize: create valid events, then edit/remove only events you organize.
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
| `/events/new` | Protected create placeholder, no submitted form |
| `/events/:eventId/edit` | Protected edit placeholder, no submitted form |
| `/login` | Demo profile selection with loading, empty, error, and pending states |
| `*` | Not-found fallback |

All routes share responsive RollCall navigation and current login state. Anonymous visits to
create/edit redirect to login, as does joining an event. Login accepts only safe internal
`returnTo` paths and returns there; users explicitly retry joining after login. Logout updates
all session consumers and a protected page redirects to login. Route guards simulate a signed-in
session only; API organizer/capacity/access rules remain authoritative within the mock.

Events may be public or unlisted. Unlisted events are accessible by direct link but absent
from discovery; no invitation or private-event administration is implemented. Minimum age is
displayed as event guidance, without collecting birth dates or adding age verification.
Join/leave updates the detail cache immediately and refreshes affected lists. Hosts occupy
a separate seat, full-table participants can still leave, and duplicate joins never add a
second seat. Discovery defaults are applied by API filters, not by reading fixtures in UI code.

The ten mock events cover Podgorica, Niksic, Budva, Kotor, Bar, Cetinje, Herceg Novi, and Tivat.
Venues are fictional. Core dates roll forward on reload to keep the demo usable; past,
canceled, unlisted, empty, full, and final-seat cases are retained for validation.

## Design

Take inspiration from Meetup's discovery hierarchy: useful filters, scannable events, clear
dates/locations, and a prominent primary action. Use charcoal/navy surfaces, restrained purple
accents, and clean typography. `frontend/DESIGN.md` owns guidance and `frontend/src/index.css`
owns tokens. The homepage uses a confident hero, code-native tabletop illustration, category
tiles, and responsive event cards. Existing palette/font/radius tokens are unchanged.

## Acceptance and collaboration

- Replace listings with users, games, and events while retaining feature boundaries.
- Implement documented validation, permissions, capacity, idempotent attendance, and isolated
  mock responses (callers cannot mutate stored records through returned references).
- Keep Codex and Claude instructions consistent and preserve `.claude/` tooling.
- Use separate GitHub feature branches and PRs; coordinate edits to shared files.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` before handoff; report checks and limits.
- Follow the existing UI review workflow for page work. No commits, pushes, or merges without approval.
