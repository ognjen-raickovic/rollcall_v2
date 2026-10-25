---
paths:
  - "frontend/src/features/**/api/**"
---

# Data

- RollCall 4C-1 production event reads use `persistent-events-api.ts` and dedicated UUID
  DTOs/query hooks. The CRUD/join/leave mock guidance below applies only to numeric demo
  APIs under development-only `/demo/events` routes. Real event mutations await 4C-2.
- Real event detail keys use the shared `EVENT_DETAILS_QUERY_KEY` plus event/viewer UUIDs;
  auth transitions destroy sensitive queries and reads consume abort signals/recheck identity.
  Discovery has separate public cursor-page keys. Never mix public backend records with
  fixtures or attach numeric mock mutations to UUID event controls.

- Entity types live in `src/features/<name>/types.ts`, and every type change also goes into `docs/entities.md` at the repo root
- `src/features/<name>/api/<name>-api.ts` exposes the operations in `docs/entities.md`, matching the future REST API: `list`, `get`, and (for writable domains) `create`, `update`, `remove`. RollCall users/games are read-only; events also expose `join` and `leave`.
- The mock uses `delay` and `NotFoundError` from `@/lib/mock-db`; a feature's mock data stays in its own `api/` folder
- Mock data looks real (real titles, cities, prices), no "Lorem ipsum"
- Hooks live in `src/features/<name>/api/use-<name>.ts`: reads use `useQuery`, writes use `useMutation` and call `invalidateQueries` on success
- Cache keys: `[entity]`, `[entity, id]`, `[entity, filter]`. Event details use `['events', id, userId]` to isolate private records by demo identity.
