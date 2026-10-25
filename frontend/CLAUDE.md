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
- `src/features/<name>/api/<name>-api.ts`: data access (geography/profiles/real game catalog use Fastify; users owns Supabase Auth; numeric event/demo APIs remain mocked)
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

- Milestone 3A adds real Auth in the users feature. Its Supabase browser client uses only
  the configured public URL/publishable key, PKCE and supported session persistence/refresh.
  Do not query application tables directly from the browser. Read `../docs/authentication.md`.
  Milestone 3B adds real UUID profiles, private birth year and per-game experience. Keep event
  CRUD/attendance and numeric demo catalogs mocked. Real UUID accounts and numeric
  demo identities remain separate; neither identity may be coerced into the other.
  Explicit demo mode requires `import.meta.env.DEV` and `VITE_ENABLE_DEMO_MODE=true`;
  production builds cannot select fixture profiles. Read `../docs/location-ui.md` for geography.
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
  is enforced by the separate Milestone 4A event API, which React does not consume yet.
  Milestone 4B permits verified current participants as well as hosts to read protected
  addresses/private details, with no new private admission. React still uses its mock APIs.
- Read `../SPEC.md` for scope. Homepage, demo login, discovery/details, and shared create/edit
  forms, optional browser-side covers, curated tags, and light/dark themes are implemented.
  Recurring events, invitations, cloud uploads, and advanced administration remain out of scope.
- Real profiles expose owner editing and game-experience mutations; the real game catalog is read-only.
  Separate numeric demo user/game catalogs expose reads only. Events expose CRUD and join/leave, applying the scoped
  CRUD guidance in `.claude/rules/data.md`. Use events as the feature implementation reference.
- Demo relationships use numeric IDs; real profile IDs are Auth UUIDs and real game/geographic IDs are integers.
  Shared mock request/error/reference helpers live in `src/lib/mock-db.ts`;
  entity records stay in their feature's `api/` folder. Features never import each other's types.
- Demo event writes take a mock actor and enforce `../docs/entities.md`. Mock profiles, games, and
  public/unlisted events have public reads; private events require an authorized mock actor.
- The users domain owns real Auth APIs/hooks/forms and SDK auth-state subscription, plus
  the separate legacy `session-api.ts` numeric demo API/hooks and demo route guard.
  The demo selection is tab-scoped; real Auth uses the SDK's persisted/refreshable session.
  Supabase callbacks must not await other Auth SDK calls inside `onAuthStateChange`.
  Profile editing/onboarding and per-game experience are implemented in Milestone 3B.
  Milestones 4A/4B implement UUID event backend APIs and real attendance; React migration is 4C. Do not switch
  event mocks without that explicit task. See `../docs/events-api.md` for the separate DTOs.
- Read `../docs/profiles.md`. Public profiles exclude email/private birth year/roles. Compose
  the existing geography picker and real game catalog into profile forms at routes; never
  import geography/games from users. Clear private profile caches on logout/account changes.
  Experience is self-declared and does not gate mock attendance. No profile picture uploads.
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
