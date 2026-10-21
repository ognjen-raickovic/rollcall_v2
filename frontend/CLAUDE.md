# Frontend

React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui + React Router + TanStack Query.
Design is described in @DESIGN.md, entities in @../docs/entities.md.
All paths below are relative to `frontend/`.

## Feature-first
Every feature (users, games, events) lives in `src/features/<name>/` and has only the
subfolders it needs: `api/`, `components/`, `hooks/`, `types.ts`. Features do not import each
other; a route in `src/app/routes/` combines them on one page. Shared code goes to
`src/components/ui` or `src/lib`, and only once at least two features use it.
Dependency direction: shared code -> features -> app, never the other way around.

## Structure
- `src/app/router.tsx`: all routes; `src/app/providers.tsx`: global providers (TanStack Query)
- `src/app/routes/`: one file per route, only combines features and layout
- `src/features/<name>/types.ts`: entity types of that feature
- `src/features/<name>/api/<name>-api.ts`: the only place that fetches data (mock for now)
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
- Read `../SPEC.md` for scope. The homepage and demo login are implemented; create/edit
  routes remain placeholders. Do not add event forms or advanced administration in this task.
- User profiles/games expose read APIs only. Events expose CRUD and join/leave, applying the scoped
  CRUD guidance in `.claude/rules/data.md`. Use events as the feature implementation reference.
- Relationships use numeric IDs. Shared request/error/reference helpers live in `src/lib/mock-db.ts`;
  entity records stay in their feature's `api/` folder. Features never import each other's types.
- Writes take a mock actor and enforce `../docs/entities.md`; reads are public.
- The users domain owns `session-api.ts`, session query/mutation hooks, login UI, and the
  route guard. Session selection is tab-scoped; no real credentials, tokens, or auth service.
- Compose session-aware navigation and event participation in app routes. Shared layout gets
  an account slot; events get a user ID through props. Never import users into events or shared code.
- If Playwright MCP is unavailable, use local Playwright if available and report skipped checks.
