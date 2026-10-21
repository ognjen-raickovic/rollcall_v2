---
paths:
  - "frontend/src/features/**/api/**"
---

# Data

- Entity types live in `src/features/<name>/types.ts`, and every type change also goes into `docs/entities.md` at the repo root
- `src/features/<name>/api/<name>-api.ts` exposes `list`, `get`, `create`, `update`, `remove`, matching the future REST API
- The mock uses `delay` and `NotFoundError` from `@/lib/mock-db`; a feature's mock data stays in its own `api/` folder
- Mock data looks real (real titles, cities, prices), no "Lorem ipsum"
- Hooks live in `src/features/<name>/api/use-<name>.ts`: reads use `useQuery`, writes use `useMutation` and call `invalidateQueries` on success
- Cache keys: `[entity]`, `[entity, id]`, `[entity, filter]`
