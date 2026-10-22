# RollCall

RollCall helps people discover, organize, and join tabletop gaming events: D&D, Magic:
The Gathering, Yu-Gi-Oh!, board games, and social deduction games.

Built for **AI-DEV 2026 Workshop 3**, from
[jovanp-najveci/ai-frontend-starter](https://github.com/jovanp-najveci/ai-frontend-starter).
The frontend includes domain mock APIs, a discovery homepage, Montenegro event discovery
and complete details, demo login, participation, and reusable event creation/editing forms
with inline validation and host authorization.
The final polish adds optional custom event covers, curated multi-select tags, and a
matching light theme alongside the default dark theme.

## Setup

Use Node.js 22.12+ (or a newer supported LTS) and the pnpm version pinned in `package.json`.
Run everything from the repository root:

```bash
npm install -g pnpm@12.14.0       # once, if needed
pnpm install
pnpm dev                        # http://localhost:5173
pnpm typecheck
pnpm lint                       # oxlint + feature boundary checker
pnpm build                      # frontend/dist
pnpm test:mock                   # mock API integration checks, no backend needed
pnpm format                     # Prettier on frontend/src
pnpm --filter frontend preview  # preview the production build
```

On PowerShell with disabled script execution, use `pnpm.cmd` instead of `pnpm`.
No environment variables, backend, database, or API keys are required.

For submission checks, run typecheck, lint, build, and `pnpm test:mock`. The mock suite
covers entity references, validation, authorization, private access, capacity, concurrent
joins, response isolation, and demo sessions. Preview the production build, then review
home, discovery, details, login, and create/edit at 375px and 1440px. Keep creation/editing
journeys within one page runtime: reloading intentionally restores fixture event data.
See [the final frontend review](docs/frontend-review.md) for executed checks and limitations.

## Architecture and scope

React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui + React Router + TanStack Query.

```text
AGENTS.md                    Codex entry point referencing shared rules
CLAUDE.md                    Claude Code monorepo instructions
SPEC.md                      Shared product scope and acceptance criteria
frontend/
  CLAUDE.md                  Frontend architecture and rules
  DESIGN.md                  Visual identity and token meanings
  src/app/                   Providers, router, route composition
  src/features/users/        Public profiles, demo session API/hooks, login and route guard
  src/features/games/        Game catalog types, read mocks, query hooks
  src/features/events/       Types, mock CRUD/attendance, shared validation/form, discovery/details
  src/components/ui/         Starter shadcn primitives
  src/components/layout/     Navigation and app layout
  src/lib/                   Mock helpers, reference IDs, utilities
backend/                     Reserved for the next workshop
docs/entities.md             Fields, relationships, permissions, future REST contracts
.claude/                     Preserved rules, commands, design skill, reviewer, format hook
```

Features never import each other, including types. Routes compose them, and shared code
never imports features or app code. `pnpm lint` enforces these boundaries. Components use
TanStack Query hooks; feature APIs own data access. Each feature stores its own mock records.
Shared reference IDs validate relationships without cross-feature imports.

Mock writes take an explicit `{ userId }` actor and simulate permissions; this is **not
real authentication**. Event data lives in memory and refresh resets changes. Choose a demo
profile at `/login`; its ID stays in sessionStorage for this tab until logout/close (memory
fallback if storage is blocked). No password is needed. No backend,
database, durable event storage, payments, messaging, maps, or waitlists are implemented.
See `docs/entities.md` for exact contracts and error behavior.

Routes: `/`, `/events`, `/events/:eventId`, `/events/new`, `/events/:eventId/edit`, `/login`,
and a not-found fallback. The homepage includes search, categories, and upcoming events.
Search/category links filter the upcoming public event list through URL parameters. Search
matches event titles; city, game, and open-seat controls combine with it and can be reset.
Event details show the host, game, address, schedule, tags, minimum age, visibility, and
capacity. Join/leave updates visible seats and provides success/error feedback; anonymous
protected actions redirect to login and back. Full, past, and canceled tables cannot be joined.
Signed-in users can create events; only the host can edit them. Both routes use a shared
React Hook Form + Zod form, preserving entered data on errors and navigating to details on
success. Public future events appear in matching discovery filters. UI branding is always **RollCall**.

Create/edit supports optional JPG, PNG, or WebP covers up to 3 MiB (shown as 3 MB in the UI).
The browser resizes them to a maximum 1600px edge and passes a bounded data URL through
the existing mock image field; cards/details render the result. Replace or remove a custom
cover in the form, or keep the game-based default. Custom covers survive game changes and
reset with event data on reload. Nothing is uploaded externally or stored in browser storage;
backend picture storage will be decided in the next workshop.

Tags use eight predefined options, with at most six selections and removable chips. The
experience level controls Beginner friendly/Veterans only compatibility. The navbar theme
toggle saves dark/light preference in localStorage (`rollcall.theme`); dark is the default,
and unavailable storage still permits switching for the current page runtime.

Private events are hidden from discovery and readable only by the host and current participants.
Unlisted events remain accessible by link. Private events do not accept new players; no
invitation workflow is implemented. These are mock access checks, not real authentication.

Ten fictional Montenegro events cover Podgorica, Niksic, Budva, and other cities. Core dates
roll forward on reload; special canceled, past, and unlisted examples remain available by
direct link. Images are local SVG illustrations in `frontend/public/images/`, with no external
image service. Minimum age is displayed as guidance without verification. Event removal
exists in the mock API only; the MVP has no deletion UI. A newly created private event
is initially visible to its host only.

## Team workflow: Codex and Claude Code

All code, identifiers, comments, commit messages, docs, and UI copy are in English.
You can talk to either assistant in any language.

1. Read `SPEC.md`, `docs/entities.md`, and the relevant instructions. Codex starts at
   `AGENTS.md`; Claude Code at `CLAUDE.md` and `frontend/CLAUDE.md`. Both follow the
   existing `.claude/rules/` and `frontend/DESIGN.md`.
2. Agree on task ownership and show a plan before edits. Use a separate feature branch per
   task/person (for example `feat/event-filters` or `feat/event-form`), based on current `main`.
   Coordinate shared contract, router, token, and lockfile changes before parallel work.
3. Keep PRs focused. Update entity contracts with types/APIs and the spec with scope changes.
   Preserve teammates' changes and `.claude/`. Never commit secrets or environment files.
4. Run `pnpm typecheck`, `pnpm lint`, and `pnpm build`. For UI, inspect at 375 px and 1440 px,
   compare with DESIGN.md, and check console errors. Report unavailable checks.
5. Obtain explicit approval before committing or pushing. Open a GitHub PR explaining the
   problem, resulting behavior, validation, and limitations. Have the teammate review;
   merge only with approval, then update local `main` before starting the next branch.

Claude Code retains `/new-feature`, `/new-page`, `/check`, the `design-system` skill,
`ui-reviewer`, and formatting hook. Generic feature templates now use events as their
reference; users/games intentionally expose only reads. Codex performs equivalent checks
with available tools; Claude hooks do not automatically run for Codex edits.
`.mcp.json` retains Playwright, shadcn, and Context7; these depend on each developer's tool
configuration, not the running app. MCP servers use `npx` as in the starter.
