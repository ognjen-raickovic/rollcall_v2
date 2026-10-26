# Backend instructions for Codex and Claude Code

These rules extend the root `AGENTS.md` and `CLAUDE.md`; they are the same architecture
for both assistants. Read `../SPEC.md`, `../docs/entities.md`,
`../docs/backend-architecture.md` and `../docs/database-schema.md` before domain changes.

- Milestone 1 implements Fastify/TypeScript configuration, health and geography reads.
  Milestone 2A adds GeoNames import tooling and backend search only. Read
  `../docs/geographic-import.md` before imports/search changes. Milestone 2B frontend
  integration is delivered. Milestone 3A adds reusable verified Supabase bearer identity
  and `GET /api/me`. Milestone 3B adds UUID profile reads/owner writes, private optional birth
  year, real catalog reads and per-game experience. Milestone 4A adds persistent event
  discovery/details and host-only create/update/delete. Milestone 4B adds persistent
  transactional join/leave and participant-aware details. Frontend reads/actions are
  integrated in 4C-1/4C-2. Storage covers are implemented in 4D, private codes in 5A and
  role management in 5B-1; moderation remains 5B-2. Read `../docs/event-covers.md` for image work.
- Preserve the frontend's mocks, numeric IDs, routes and styling. Do not import frontend
  feature types into this package. Real frontend UUID DTOs stay separate from numeric demos.
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
- Authenticated endpoints use the reusable auth guard and a fresh request-local identity.
  Verify signatures through supported Supabase `getClaims`, plus issuer/audience/expiry
  and UUID subject checks. Never trust client actors/roles or mutate a shared client's session.
  Read `../docs/authentication.md`; `/api/me` returns only safe UUID/email identity.
  Preserve public geography and focused profile/catalog grants/RLS; raw event tables and roles remain denied.
  No service-role key. Read `../docs/profiles.md` for atomic profile/age writes and private DTO rules.
- Profile and experience mutations use the verified account UUID and an isolated bearer-scoped
  unprivileged client. Enforce owner checks, immutable identity/timestamps, geographic consistency
  and valid game/experience values in SQL as well as API validation. Public responses contain no
  email, private age/declaration or role information. Keep the registration initializer unchanged.
- Read `../docs/events-api.md` for event contracts. Use bounded checked RPCs, not broad table
  grants. Private details/addresses require the verified host or current participant in 4B;
  roles/sharing flags grant no access. Attendance derives its actor from Auth, locks the
  event and rechecks visibility/state/actual time before mutations/no-ops. Reuse membership
  keys and counters; never read a count then insert without serialization. Private outsiders
  cannot join; claimed experience/age does not gate attendance. Event and counter-trigger
  executors are NOLOGIN/NOBYPASSRLS with separate minimal privileges. Harden search paths
  and ACLs; trigger-only counter privileges must not become client grants. The argument-free
  Auth subject helper reads no tables. Keep development-only frontend mocks isolated from real APIs.
- Version schema changes under `../supabase/migrations/`. Add explicit grants/RLS, indexes,
  delete behavior, constraints and tests with each schema change. Keep private age, roles,
  exact addresses and future invitation secrets outside public DTOs.
- Cover uploads are backend-mediated multipart, bounded and decoded/re-encoded with Sharp.
  Never trust MIME/extension alone. Writes/signing combine the existing unprivileged caller
  JWT with a server-only operation key verified by SQL/RLS; never forward a client's copy
  of that header or introduce a service-role bypass. Current event access governs reads;
  only backend signing may issue 60-second access. Preserve retired-path cleanup/tombstones,
  compensate failed writes without deleting active objects and never fabricate/remove file
  metadata through SQL. `pnpm covers:setup` accepts local maintenance connections only.
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

## Milestone 5A

Read ../docs/private-invitations.md before invitation work. Failed validation outcomes must commit limiter writes; recheck code state after the event lock. Reuse attendance triggers, verified UUID and checked backend capability. No plaintext codes, service-role bypass or administrative override.

## Milestone 5B-1

Read ../docs/administration.md. Administration uses verified UUIDs/current database assignments, an unprivileged caller client, checked RPCs and a narrow executor. No raw Auth/private-profile/secret grants. Serialize role writes/bootstrap, authorize after the lock and audit atomically. No API superadmin assignment, self-edit, generic audit writer or public bootstrap. The bootstrap command requires explicit operator confirmation and literal loopback; hosted provisioning is separate.

## Milestone 5B-2A

Read ../docs/event-moderation.md. The separate moderation executor gets only bounded report operations and event status cancellation. Private RPCs enforce real current actors/roles and event access independently of Fastify. Shared role locks precede event/report locks; audit and successful state changes commit atomically. Failed report verification must commit durable attempts. Preserve restricted helper grants, catalog RLS, existing event constraints and anti-reactivation protection; never broaden event PATCH.
