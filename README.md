# AI-DEV 2026 · Workshop 3 · Monorepo starter

A monorepo keeps every part of the app in one repository: `frontend/` today, `backend/` next workshop,
and shared docs in `docs/`. One clone, one install, one pull request for a change that touches both sides,
and the agent sees the whole app at once.

React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui, set up for working with Claude Code.

## Getting started

For your team: click **Use this template** on GitHub to create your own repository, then clone it.

The course uses [pnpm](https://pnpm.io). Install it once, then run the project from the repo root:

```bash
npm install -g pnpm   # once per machine
pnpm install
pnpm dev              # http://localhost:5173
pnpm lint             # oxlint + boundary check between features
```

Open the repo root in VS Code and start the Claude Code extension.

## Layout

```
frontend/         React app (this workshop)
  src/app/        router.tsx, providers.tsx and routes/ (one file per route)
  src/features/   one folder per feature: api/, components/, types.ts (example: listings)
  src/components/ ui/ (shadcn) and layout/
  src/lib/        utils.ts and mock-db.ts
backend/          API, database and auth (next workshop)
docs/entities.md  entities and the API contract between frontend and backend
```

Features do not import each other; a route combines them. `pnpm lint` checks these boundaries
(`frontend/scripts/check-boundaries.mjs`) and reports the exact file and import that breaks them.

## Language

All code, identifiers, comments, commit messages, docs and UI copy are in English.
Talking to Claude in any language is fine.

## First steps with Claude

1. "Interview me about our app's design, one question at a time, then fill in frontend/DESIGN.md and update the tokens in frontend/src/index.css."
2. Fill in the first sentence of CLAUDE.md with your app's topic.
3. `/new-feature <name>: <description>` for each feature of your app, then delete the `frontend/src/features/listings` example.
4. `/new-page` for each screen: home, list, detail, form, sign-in.
5. `/check` and the `ui-reviewer` agent before every commit.

## What is in the .claude folder

| File | Purpose |
| --- | --- |
| `CLAUDE.md` | Monorepo overview, language rule, root commands |
| `frontend/CLAUDE.md` | Stack, feature-first structure, rules, "done when" |
| `frontend/DESIGN.md` | Visual identity the agent reads before UI changes |
| `.claude/rules/` | Rules that load only for matching files (data, components, styling, features) |
| `.claude/commands/` | `/new-page`, `/new-feature`, `/check` |
| `.claude/skills/design-system/` | Design rules that load when working on UI |
| `.claude/agents/ui-reviewer.md` | Subagent that reviews UI and changes nothing |
| `.claude/settings.json` | Permissions, Explanatory output style and a hook that formats every edited file |
| `.mcp.json` | Playwright (browser), shadcn (component catalog) and Context7 (current library docs) |

The MCP servers in `.mcp.json` start with `npx`, because `npx` ships with Node and works no matter which
package manager you use.

Recommended: `/plugin install frontend-design@claude-plugins-official`
