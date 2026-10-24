# Backend instructions for Codex and Claude Code

These rules extend the root `AGENTS.md` and `CLAUDE.md`; they are the same architecture
for both assistants. Read `../SPEC.md`, `../docs/entities.md`,
`../docs/backend-architecture.md` and `../docs/database-schema.md` before domain changes.

- Milestone 1 implements Fastify/TypeScript configuration, health and geography reads.
  Milestone 2A adds GeoNames import tooling and backend search only. Read
  `../docs/geographic-import.md` before imports/search changes. Milestone 2B frontend
  integration, real login, event endpoints, uploads, room codes and admin interfaces are deferred.
- Preserve the frontend's mocks, numeric IDs, routes and styling. Do not import frontend
  feature types into this package. Database UUIDs require an explicit future integration.
- Keep routes, Zod validation and data access within the owning module; common errors and
  server-only Supabase initialization may live in shared/config/db code. Add folders only
  when they contain working code; avoid generic repository/service frameworks.
- Query through the unprivileged Supabase Data API client. No service-role key, privileged
  shared connection or RLS bypass for ordinary requests. Combine explicit grants with RLS.
- Import tooling is a separate local maintenance process with a loopback-only PostgreSQL
  connection. Never reuse its database credentials/privileges in API modules. Use parameterized
  SQL, source checksums and transactions. Preserve stable city IDs and application references;
  do not delete places simply because a later extract omits them or merge ambiguous names.
- Download only the four supported country extracts. Keep archives/extracted data ignored;
  retain code, filters, manifests/reports and attribution. Never describe a sample or source
  dataset as perfectly complete. Read reported counts before claiming an import succeeded.
- Later authenticated endpoints must verify Supabase identity and use a fresh request-local
  context. Never trust client actors/roles or mutate a shared client's session.
- Version schema changes under `../supabase/migrations/`. Add explicit grants/RLS, indexes,
  delete behavior, constraints and tests with each schema change. Keep private age, roles,
  exact addresses and future invitation secrets outside public DTOs.
- Keep errors consistent as `{ code, message, fields }`. Do not return raw database errors,
  keys or stack traces. Redact headers/secrets from logs; do not log sensitive payloads.
- Configuration must fail clearly without exposing invalid environment values. Keep `.env`
  ignored and `.env.example` free of real credentials.
- Run commands from the root: `pnpm typecheck`, `pnpm lint`, `pnpm build`,
  `pnpm test:backend`, and `pnpm test:mock`. Run local SQL/integration checks when available.
  Use `pnpm.cmd` on PowerShell if script shims are blocked.
- Never create, link, alter, reset or deploy a remote Supabase project without explicit
  approval. Local reset commands must specify local targeting. Do not commit, push, merge
  or deploy without approval.
- Apply additive migrations locally without resetting existing data when possible. Before a
  destructive local reset, inspect whether application/imported data needs preserving.
- Report database tests actually executed separately from prepared SQL/static review.
  A repository stub test is not a live database integration test. Document unavailable checks.
