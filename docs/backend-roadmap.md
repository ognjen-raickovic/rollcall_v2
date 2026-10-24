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

## Milestone 2A: geographic data import and backend search

- GeoNames ME/RS/BA/HR country extracts, explicit current populated-place filters and
  CC BY 4.0 attribution. No worldwide extract or population threshold is needed.
- Validated, parameterized local imports with checksums, per-country transactions,
  source identity, stable internal IDs, unambiguous seed adoption and safe reruns.
- Canonical/ASCII/alternate names, administrative metadata, coordinates and source
  population where available. Same-name places remain distinct geographic records.
- Indexed case/accent/Serbian Latin-Cyrillic normalization, exact/prefix-before-substring
  ranking, prominent default suggestions and the existing bounded city endpoint.
- Tests and actual local import/search/query-plan verification, with counts and limitations
  recorded separately from the code. See [geographic import](geographic-import.md).

The seed remains an intentionally incomplete development sample; imported data is broader
source coverage, not a claim of perfect completeness or verified administrative truth.

## Milestone 2B: frontend country and city selection

1. Add a geography feature API/hooks layer consuming the existing country/search endpoints.
   Keep data access inside feature boundaries; do not download the entire place catalog.
2. Add country selection and debounced city autocomplete. Empty input requests about four
   prominent suggestions; typing requests new bounded results. Handle loading, errors,
   empty results and stale requests, with accessible keyboard selection.
3. Store/submit the selected city ID, show its name and administrative context, and clear
   an incompatible city whenever country changes. Country choices come from the API.
4. Deliberately adapt existing string-city form/mock contracts rather than coercing IDs or
   replacing event/auth mocks as an accidental side effect. Preserve themes, layouts,
   validation and all working journeys.

No 2B UI integration is part of Milestone 2A. Real event persistence and authentication
remain separate later milestones.

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
