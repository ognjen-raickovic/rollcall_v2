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
- `src/features/<name>/api/<name>-api.ts`: data access (geography/profiles/catalog/production event reads use Fastify; users owns Supabase Auth; separate numeric event/demo APIs remain mocked)
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
  Milestone 3B adds real UUID profiles, private birth year and per-game experience. Milestone
  4C-1 connects production reads; 4C-2 connects real CRUD/attendance. Keep numeric demos separate
  under development-only `/demo/events` routes. Real UUID accounts and numeric
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
  is enforced by the Milestone 4A/4B event API, consumed by real read pages in 4C-1.
  Milestone 4B permits verified current participants as well as hosts to read protected
  addresses/private details, with no new private admission. Demo mutations remain mocked.
- Read `../SPEC.md` for scope. Homepage, demo login, discovery/details, and shared create/edit
  forms, optional browser-side covers, curated tags, and light/dark themes are implemented.
  Milestone 4D adds persistent event cover uploads; profile pictures, recurring events,
  invitations and advanced administration remain out of scope.
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
  Milestones 4A/4B implement UUID event backend APIs and real attendance; 4C-1 implements
  React reads and 4C-2 adds mutations. See `../docs/events-api.md` for DTOs and
  `../docs/event-actions-verification.md` for mutation/browser verification.
- `api/event-dtos.ts`, `persistent-events-api.ts` and `use-persistent-events.ts` own real
  event read schemas/HTTP/query hooks. Do not coerce UUIDs into `types.ts` numeric mocks.
  Details receive the route-composed `useApiSession` getter, verify viewer identity before
  and after HTTP, and use `EVENT_DETAILS_QUERY_KEY` plus event/viewer UUIDs. Auth cleanup
  destroys these queries before account transitions. No tokens in keys/URLs; no retained
  sensitive cache or previous-account placeholder data. Auth errors hide cached addresses.
- Discovery is public, cursor-paginated and never falls back to mocks. Changing filter scopes
  drops accumulated pages; category filtering applies to loaded chronological pages and
  keeps Load More available until exhaustion. Use real catalog IDs. Public cards have no
  price/address because summaries omit them. `EventDetailsView` shares presentation between
  real and explicit demo controllers, while action controls remain separate.
- `event-write-dtos.ts`, `persistent-event-actions-api.ts` and `use-persistent-event-actions.ts`
  own real write contracts/HTTP/mutations. Capture actor/session per operation; abort when
  accounts change, cancel stale reads and recheck identity before cache effects/navigation.
  No optimistic updates. Leave hides protected addresses immediately and private departure
  navigates to discovery. Zero inactive mutation retention avoids retaining addresses/drafts.
- `/events/new` requires real Auth and `/events/:eventId/edit` verifies the host DTO/UUID.
  Share `EventFormView`, keeping real/demo controllers separate. Send selected cityId and
  allowed fields only; never actor/country/counts/images. Preserve drafts on errors/refetch
  and unchanged ISO timestamps when editing. Covers use the separate 4D multipart API.
  Deletion requires an accessible confirmation. Demo actions remain development-only under
  `/demo/events/*` with opt-in and never receive UUID actors/events. Keep useful mock tests.
- Read `../docs/profiles.md`. Public profiles exclude email/private birth year/roles. Compose
  the existing geography picker and real game catalog into profile forms at routes; never
  import geography/games from users. Clear private profile caches on logout/account changes.
  Experience is self-declared and does not gate mock attendance. No profile picture uploads.
- Compose session-aware navigation and event participation in app routes. Shared layout gets
  an account slot; events get a user ID through props. Never import users into events or shared code.
- Event host/game query components are passed into detail render slots from the route.
  Discovery uses API filters for upcoming/public events; mock records are never read by UI components.
- Demo `EventForm`/`useEventForm` reuse `api/event-validation.ts` and `event-form-values.ts`.
  Real controllers use `event-write-dtos.ts` and `persistent-event-form-values.ts`, sharing
  `EventFormView` presentation and `event-date-time.ts` conversion without numeric adapters.
- Use `event-tags.ts` for the canonical EventTag values and experience compatibility. Native
  checkboxes in the Radix popover provide multi-selection; no arbitrary tags are accepted.
- `api/event-covers.ts` validates/prepares JPG/PNG/WebP files up to 3 MiB, resizing to a maximum
  1600px edge and encoding a bounded data URL. Preserve custom covers across game changes;
  removing a custom cover restores the selected game's default. Never store cover data in
  localStorage/sessionStorage. Numeric demos retain these values in their own mock API;
  real forms convert the draft to a multipart File outside the normal event mapper.
- Read `../docs/event-covers.md`. Real custom cover metadata contains only a version and
  local fallback illustration; `persistent-event-covers-api.ts` resolves validated short-lived
  access through query hooks. Cover keys include event/viewer/version, retain nothing when
  inactive, refresh in the foreground and clear on auth/access mutations. Never put signed
  URLs in query keys, storage or logs. Preserve account checks before/after HTTP and bounded
  image-error refresh. Staged save retains the persisted UUID if an image fails; retry never
  creates another event. Keep the existing picker, layout and numeric demo separation.
- `src/lib/theme.ts` and the head script in `index.html` share `rollcall.theme`. Keep both
  bootstrapping and runtime switching consistent; all palettes stay in `src/index.css`.
- Editor access and update operations require the host. Private event reads require the host
  or existing participants. Event detail cache keys include the current demo user ID.
- If Playwright MCP is unavailable, use local Playwright if available and report skipped checks.
