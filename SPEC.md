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

This task establishes contracts, tokens, and simple routes. Finished discovery pages, event
forms, and login flows belong to later tasks. `docs/entities.md` owns the detailed field,
validation, access, and future HTTP contracts; local types/APIs implement them.

## Feature ownership

| Domain | Responsibility |
| --- | --- |
| users | Read-only public player/organizer profiles; no credentials or private email |
| games | Read-only game catalog and categories |
| events | Discovery, details, creation, editing, removal, joining, and leaving |

An event references one organizer and one game by numeric ID. A user can organize many events
and attend many other events. Attendee IDs represent players: the organizer is separate and
does not consume a seat. Features never import each other, including types. Routes compose
features. Shared mock reference IDs validate relationships without cross-feature imports.

APIs return Promises of entities, arrays, or void and reject with common typed errors.
TanStack Query wraps reads; mutations invalidate event list/detail caches. Explicit mock
actors simulate permissions and provide no authentication or security.

## Intended journeys

- Discover: filter by search, city, game, category, date range, and open seats.
- Inspect: read schedule, venue, organizer, game, experience level, price, and capacity.
- Organize: create valid events, then edit/remove only events you organize.
- Participate: join upcoming scheduled events with space; leave before they start.
- Sign in: reserved for later; the foundation collects no credentials.

## Routes

| Path | Foundation behavior |
| --- | --- |
| `/` | Product introduction and link to events |
| `/events` | Minimal list/search with loading, empty, and error states |
| `/events/:eventId` | Minimal detail with invalid-ID, not-found, loading, and error states |
| `/events/new` | Create placeholder, no submitted form |
| `/events/:eventId/edit` | Edit placeholder, no submitted form |
| `/login` | Login placeholder |
| `*` | Not-found fallback |

All routes share responsive RollCall navigation. There are no route guards yet; reaching
create/edit does not grant API write permission.

## Design

Take inspiration from Meetup's discovery hierarchy: useful filters, scannable events, clear
dates/locations, and a prominent primary action. Use charcoal/navy surfaces, restrained purple
accents, and clean typography. `frontend/DESIGN.md` owns guidance and `frontend/src/index.css`
owns tokens. Establish readable layouts without polished cards or a large hero.

## Acceptance and collaboration

- Replace listings with users, games, and events while retaining feature boundaries.
- Implement documented validation, permissions, capacity, idempotent attendance, and isolated
  mock responses (callers cannot mutate stored records through returned references).
- Keep Codex and Claude instructions consistent and preserve `.claude/` tooling.
- Use separate GitHub feature branches and PRs; coordinate edits to shared files.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` before handoff; report checks and limits.
- Follow the existing UI review workflow for page work. No commits, pushes, or merges without approval.
