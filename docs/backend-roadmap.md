# RollCall backend roadmap

This roadmap separates working code from design foundations and future product work.
It does not authorize hosted project changes, deployment or implementing later milestones.

## Workshop 3: delivered frontend

The React MVP has homepage/discovery, filters, event details, demo profile selection,
join/leave, host-only create/edit, optional browser-prepared covers, curated tags and
dark/light themes. Data is in memory, numeric IDs are mock references, and refresh resets
event changes. Demo sessions do not provide authentication. Keep this working independently
through the backend milestones.

## Milestone 1: backend and database foundation

- Node.js/TypeScript Fastify workspace package, Zod environment/input validation and tests.
- Health plus database-backed enabled-country and bounded city-search endpoints.
- Local Supabase CLI configuration, reproducible SQL migrations and development seeds.
- Relational geography, Auth-linked UUID profiles, games, per-game experience, UUID events,
  attendance, protected addresses, private age information and server-owned role foundations.
- Explicit grants/RLS. Only enabled geography is available to Data API client roles.
- Schema constraints and atomic attendance counter foundations; no event writes exposed.
- Shared architecture/schema/API/setup documentation and optional live integration checks.

Real Supabase Auth login, profile/event HTTP operations, private invitations, role management,
Storage uploads and frontend integration are not delivered by this milestone. Database
execution/test status must be reported from actual local results, not inferred from SQL files.

## Milestone 2: comprehensive geography and frontend selection

1. Choose and document an established source, initially GeoNames under its attribution
   license. Pin a download/version/checksum, feature-code selection and country scope.
2. Build a reproducible importer for ME, RS, BA and HR that includes smaller towns and
   settlements. Preserve stable source IDs, source attribution and administrative names;
   distinguish external IDs from internal database IDs. Document update/removal policy.
3. Populate normalization consistently, test diacritic/case handling, and measure actual
   query plans/index use on many thousands of places. Evaluate alternative names without
   losing uniqueness or collapsing distinct same-name places.
4. Add frontend country selection and debounced city autocomplete through the feature API
   layer. Empty search should show about 3–4 suggestions; typing updates bounded results.
   Submit a selected city ID and clear it when a different country makes it incompatible.
5. Explicitly adapt city strings and UI types during integration. Preserve themes, responsive
   layouts and existing form behavior; avoid a scattered hardcoded frontend country enum.

The current hand-curated development seed is intentionally incomplete and must not be
presented as an import or authoritative production dataset.

## Later: real identity and profiles

Integrate Supabase Auth, verified bearer identity and request-isolated clients. Create
Auth-linked profiles through a controlled onboarding flow, enforce self-only writes and
keep age information private. Establish account deletion/retention rules, moderation needs
and a safe superadmin bootstrap outside arbitrary client access. Implement independently
self-declared game experience with clear unverified wording. Add allow/deny tests before
granting application table access.

## Later: real event and attendance APIs

Introduce authenticated create/update/remove and safe event read/discovery DTOs. Adopt
UUID user/event IDs deliberately in frontend feature API adapters. Make venue optional
while requiring a protected in-person address; exclude exact addresses from public results
by default. Preserve tag/experience, schedule, capacity, host ownership and idempotent
join/leave semantics. Implement verified-actor transactional RPCs and concurrent final-seat
tests against PostgreSQL before switching the frontend from mocks.

## Later: event covers

Implement Supabase Storage with ownership-aware bucket policies, validated image content,
bounded files and a clear public/private delivery model. Define object references, signed
URL behavior, replacement/deletion lifecycle and orphan cleanup. Keep service credentials
server-side. Existing mock data URLs are not a production storage format; no uploads or
buckets are created during Milestone 1.

## Later: private invitations and authorized administration

Add rate-limited secure code generation/validation/joining, server-managed encrypted code
retrieval, hash verification, rotation/revocation, expiry and secret-free responses/logs.
Hosts and authorized admins/superadmins may manage codes; ordinary participants never
receive them. Private details remain inaccessible before authorization. Unlisted links
remain a separate visibility model.

Add server-enforced admin/superadmin capabilities with audits. Only authorized superadmins
may promote/demote admins. No role assignment from profile update requests or editable
Auth metadata. Admin dashboards are not a Milestone 1 deliverable.

## Public launch readiness

Before any public deployment: review RLS/grants across all exposed routes, test cross-user
privacy, load-test search and attendance, configure authentication recovery/email and abuse
controls, establish backups/migrations/rollback, set origin/TLS/proxy/rate limits and document
privacy/retention responsibilities. These are future delivery gates, not claims of current
production readiness. Recurring events, chat, ratings, badges and other community features
must be separately prioritized rather than added implicitly.

Source references: [GeoNames data and attribution](https://www.geonames.org/export/),
[Supabase Auth](https://supabase.com/docs/guides/auth), and
[Supabase Storage](https://supabase.com/docs/guides/storage).
