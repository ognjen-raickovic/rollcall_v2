---
paths:
  - "frontend/src/features/**/api/**"
---

# Data

- Entity types live in `src/features/<name>/types.ts`, and every type change also goes into `docs/entities.md` at the repo root
- `src/features/<name>/api/<name>-api.ts` exposes the operations in `docs/entities.md`, matching the future REST API: `list`, `get`, and (for writable domains) `create`, `update`, `remove`. RollCall users/games are read-only; events also expose `join` and `leave`.
- The mock uses `delay` and `NotFoundError` from `@/lib/mock-db`; a feature's mock data stays in its own `api/` folder
- Mock data looks real (real titles, cities, prices), no "Lorem ipsum"
- Hooks live in `src/features/<name>/api/use-<name>.ts`: reads use `useQuery`, writes use `useMutation` and call `invalidateQueries` on success
- Cache keys: `[entity]`, `[entity, id]`, `[entity, filter]`
