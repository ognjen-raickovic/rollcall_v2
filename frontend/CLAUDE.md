# Frontend

React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui + React Router + TanStack Query.
Design is described in @DESIGN.md, entities in @../docs/entities.md.
All paths below are relative to `frontend/`.

## Feature-first
Every feature (users, games, events, geography) lives in `src/features/<name>/` and has only the
subfolders it needs: `api/`, `components/`, `hooks/`, `types.ts`. Features do not import each
other; a route in `src/app/routes/` combines them on one page. Shared code goes to
`src/components/ui` or `src/lib`, and only once at least two features use it.
Dependency direction: shared code -> features -> app, never the other way around.

## Structure
- `src/app/router.tsx`: all routes; `src/app/providers.tsx`: global providers (TanStack Query)
- `src/app/routes/`: one file per route, only combines features and layout
- `src/features/<name>/types.ts`: entity types of that feature
- `src/features/<name>/api/<name>-api.ts`: the only place that fetches data (geography uses HTTP; other domains remain mocked)
- `src/features/<name>/api/use-<name>.ts`: TanStack Query hooks around the API
- `src/features/<name>/components/`: components of that feature (e.g. `events-list.tsx`)
- `src/components/ui/`: shadcn/ui components, added with `pnpm dlx shadcn@latest add <name>` (run inside `frontend/`)
- `src/components/layout/`: app layout (header, navigation)
- `src/lib/`: `utils.ts` (`cn`) and `mock-db.ts` (mock database and delay)

## Rules
- A feature never imports another feature; `src/components` and `src/lib` never import from `src/features` or `src/app`
- No barrel `index.ts` files: import the file directly (`@/features/events/components/events-list`)
- Components and routes never call `*-api.ts` directly, only through a hook from `use-<name>.ts`
- Use an existing component from `src/components/ui` first, only then create a new one
- Colors, fonts and radius only from tokens in `src/index.css`, no hex values in components
- Every list and data page has loading, empty and error states
- No `any` and no `!` (non-null assertion)
- If you are not sure how a library API works (Tailwind v4, React Router 8, TanStack Query 5), check the docs via Context7, do not guess.

## Done when
- `pnpm typecheck` and `pnpm lint` pass
- The page was opened with Playwright MCP and screenshots at 375 px and 1440 px match DESIGN.md
- No errors in the browser console

## RollCall scope
- Milestone 2B connects only geography to Fastify. Keep event CRUD/attendance, users, games,
  demo sessions and their numeric IDs mocked. Never connect browser code directly to Supabase.
  Read `../docs/location-ui.md` for the transition and local proxy setup.
- Geography owns backend response types, query hooks and country/city controls. Compose
  those controls into events at routes through render props; features never import each other.
  `src/lib/location.ts` is the shared reference contract used by geography and events.
- A selected city uses the actual positive integer database ID plus a display snapshot.
  Do not invent IDs for legacy fixtures: preserve their city strings/country code until an
  actual suggestion is confirmed. New forms reject unconfirmed free text. Clear selection
  immediately when country or city text changes; query keys and abort signals isolate searches.
- Venue is optional (blank string when omitted; 2–120 characters when provided). Keep
  address required, but render the exact value only to the host/current participants.
  Mock data remains in browser memory and is not a privacy boundary; real server enforcement
  belongs to the future event API.
- Read `../SPEC.md` for scope. Homepage, demo login, discovery/details, and shared create/edit
  forms, optional browser-side covers, curated tags, and light/dark themes are implemented.
  Recurring events, invitations, cloud uploads, and advanced administration remain out of scope.
- User profiles/games expose read APIs only. Events expose CRUD and join/leave, applying the scoped
  CRUD guidance in `.claude/rules/data.md`. Use events as the feature implementation reference.
- Relationships use numeric IDs. Shared request/error/reference helpers live in `src/lib/mock-db.ts`;
  entity records stay in their feature's `api/` folder. Features never import each other's types.
- Writes take a mock actor and enforce `../docs/entities.md`. Profiles, games, and
  public/unlisted events have public reads; private events require an authorized mock actor.
- The users domain owns `session-api.ts`, session query/mutation hooks, login UI, and the
  route guard. Session selection is tab-scoped; no real credentials, tokens, or auth service.
- Compose session-aware navigation and event participation in app routes. Shared layout gets
  an account slot; events get a user ID through props. Never import users into events or shared code.
- Event host/game query components are passed into detail render slots from the route.
  Discovery uses API filters for upcoming/public events; mock records are never read by UI components.
- Reuse the event schema in `api/event-validation.ts` for form/API validation. Form conversion
  lives in `api/event-form-values.ts`; `EventForm` and `useEventForm` serve both routes.
- Use `event-tags.ts` for the canonical EventTag values and experience compatibility. Native
  checkboxes in the Radix popover provide multi-selection; no arbitrary tags are accepted.
- `api/event-covers.ts` validates/prepares JPG/PNG/WebP files up to 3 MiB, resizing to a maximum
  1600px edge and encoding a bounded data URL. Preserve custom covers across game changes;
  removing a custom cover restores the selected game's default. Never store cover data in
  localStorage/sessionStorage. No object URLs or backend storage providers are needed.
- `src/lib/theme.ts` and the head script in `index.html` share `rollcall.theme`. Keep both
  bootstrapping and runtime switching consistent; all palettes stay in `src/index.css`.
- Editor access and update operations require the host. Private event reads require the host
  or existing participants. Event detail cache keys include the current demo user ID.
- If Playwright MCP is unavailable, use local Playwright if available and report skipped checks.
