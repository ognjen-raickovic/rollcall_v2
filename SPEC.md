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

The foundation established contracts, tokens, and simple routes. The current task adds a
finished discovery homepage and frontend-only demo login/session. Event creation/editing forms
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

- Discover: filter by search, city, game, category, date range, and open seats.
- Inspect: read schedule, venue, organizer, game, experience level, price, and capacity.
- Organize: create valid events, then edit/remove only events you organize.
- Participate: join upcoming scheduled events with space; leave before they start.
- Sign in: choose one of eight demo profiles, return to the intended page, and log out via
  navigation. No credentials are collected. Reload restores the selection in the current tab;
  blocked storage falls back to memory. This does not provide real authentication.

## Routes

| Path | Current behavior |
| --- | --- |
| `/` | Hero, search, category navigation, featured upcoming events, how it works |
| `/events` | Cards and URL-based search, city, game/category, and open-seat filtering |
| `/events/:eventId` | Detail and session-aware join/leave, including all data states |
| `/events/new` | Protected create placeholder, no submitted form |
| `/events/:eventId/edit` | Protected edit placeholder, no submitted form |
| `/login` | Demo profile selection with loading, empty, error, and pending states |
| `*` | Not-found fallback |

All routes share responsive RollCall navigation and current login state. Anonymous visits to
create/edit redirect to login, as does joining an event. Login accepts only safe internal
`returnTo` paths and returns there; users explicitly retry joining after login. Logout updates
all session consumers and a protected page redirects to login. Route guards simulate a signed-in
session only; API organizer/capacity/access rules remain authoritative within the mock.

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
