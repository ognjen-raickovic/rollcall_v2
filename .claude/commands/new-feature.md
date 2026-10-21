---
description: New feature with a type, mock data, API functions and hooks
argument-hint: <name>: <description>
---

Add a feature: $ARGUMENTS

The format is `<name>: <description>`, e.g. `users: players who organize or attend events`. The name is plural and kebab-case.

1. Read CLAUDE.md, frontend/CLAUDE.md, SPEC.md, docs/entities.md and `frontend/src/features/events/` as the reference
2. Propose fields, types and relations to existing entities, and wait for my confirmation
3. Type in `frontend/src/features/<name>/types.ts`
4. 8–12 realistic mock records in English (real names, cities, prices, no "Lorem ipsum") and the supported functions from docs/entities.md in `frontend/src/features/<name>/api/<name>-api.ts`, modeled on `frontend/src/features/events/api/events-api.ts`, using shared delay/request and error helpers from `@/lib/mock-db`. Writable domains use `list`, `get`, `create`, `update`, `remove`; users/games currently use only `list` and `get`.
5. Hooks in `frontend/src/features/<name>/api/use-<name>.ts`
6. Components (if needed) in `frontend/src/features/<name>/components/`, with loading, empty and error states
7. Update docs/entities.md: field table, relations, access rules and the API the frontend expects
8. Do not touch other features and do not import from them; if something needs to be shared, ask me before moving it to `frontend/src/lib`
9. Run `pnpm typecheck` and `pnpm lint` from the repo root
