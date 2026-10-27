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

## Milestone 2B: frontend country and city integration

1. A geography feature API/hooks layer consumes the existing country/search endpoints.
   Keep data access inside feature boundaries; do not download the entire place catalog.
2. Country selection and debounced city autocomplete use actual backend results. Empty input requests about four
   prominent suggestions; typing requests new bounded results. Handle loading, errors,
   empty results and stale requests, with accessible keyboard selection.
3. Forms store/submit the selected city ID and display snapshot, show administrative context, and clear
   an incompatible city whenever country changes. Country choices come from the API.
4. Existing string-city form/mock contracts are adapted explicitly rather than coercing IDs or
   replacing event/auth mocks as an accidental side effect. Preserve themes, layouts,
   validation and all working journeys.

This milestone retains event/auth/attendance mocks and allows a blank venue. UI exact-address
display is limited to hosts/current participants, while real privacy enforcement remains a
future backend responsibility. Legacy fixtures keep their city text and known country without
invented IDs; edits require confirmation from a real suggestion. See
[location UI](location-ui.md) for contracts, setup and remaining limitations.

Real event persistence and authentication were separate from 2B; authentication is now 3A below.

## Milestone 3A: real authentication

Delivered scope: Supabase email/password registration, sign-in/out, confirmation/resend,
password recovery/reset, PKCE, persistent automatically refreshed sessions, authentication-aware
navigation and cryptographically verified `GET /api/me`. Minimal registration initialization
creates UUID-linked profiles with a fixed safe display name and no metadata-derived roles.
Application-table access remains denied by default; geography remains public.

Real accounts stay independent of numeric mock profiles. Legacy event demonstrations require
explicit development-only demo mode, which is unavailable in production builds. Event CRUD,
attendance and public catalogs remain mocked; a real account cannot impersonate fixtures.
See [authentication](authentication.md) for exact local setup and limitations.

## Milestone 3B: profiles and per-game experience

Implemented: owner-only profile editing, validated optional country/city, safe public UUID
profiles, private optional self-declared birth year, and independent per-game experience.
The existing database game catalog is exposed read-only. Focused grants/RLS and transactional
profile/private-age writes preserve authorization through the Data API as well as Fastify.
Registration keeps its existing minimal initializer. See [profiles](profiles.md).

Account deletion/retention, broader completion requirements and profile pictures remain future
work. Role administration and superadmin bootstrap remain separately controlled later work.

## Milestone 4A: persistent event backend API — implemented

Public scheduled discovery with country/city/game/title/date/availability filters and bounded
chronological cursor pagination; public/unlisted details; verified-host-only private details,
exact addresses and create/update/delete. Checked RPCs use strict payloads, explicit public/
host DTOs, non-bypass executor RLS and closed raw event tables. Event/address changes are
atomic; updates preserve attendance and hard delete cascades memberships/locations only.
Default local illustrations are supported; custom cover payloads are rejected.
See [contracts](events-api.md) and [verification](events-api-verification.md).

React numeric event CRUD/attendance remains mocked. The 4A delivery included no attendance
API, Storage, private codes, participant address access or admin override; 4B extends it below.

## Milestone 4B: real attendance — implemented

Verified-actor POST/DELETE `/api/events/:eventId/attendees/me` persist membership in the
existing table and return safe attendance summaries. Event row locking serializes join/leave
and host capacity changes; existing keys/triggers maintain unique seats and exact counts.
Idempotent repeats preserve timestamps, subject to access/timing/status/host rules. Private
outsiders cannot join; existing private participants may leave and lose protected access.
Participant-aware details include viewer state and authorized addresses, with no email/age/
role disclosure. Explicit grants/RLS keep raw tables closed; separate non-bypass counter
trigger privileges avoid widening event content/address permissions. Claimed experience and
minimum age remain guidance. Real HTTP/RPC, direct Data API, SQL and genuine concurrent
PostgreSQL checks are recorded in [attendance verification](attendance-verification.md).

React attendance remains mocked. No room-code admission, admin override, uploads or automated
eligibility checks are included. Participant privacy/access must remain explicit in 4C adapters.

## Milestone 4C-1: frontend event reads — implemented

Homepage featured events, cursor-paginated discovery and UUID details consume real APIs.
Dedicated DTOs preserve structured locations/game/host/counts/viewer state; viewer-aware
caches and auth/abort checks protect addresses across account transitions. Public lists
never combine fixtures or fall back when the backend is unavailable. Category filtering
applies to loaded chronological pages with Load More until exhaustion. Existing layouts,
themes, geography and profiles remain intact. Numeric workflows are isolated in opt-in
development `/demo/events/*`. See [verification](event-frontend-verification.md).

## Milestone 4C-2: frontend event mutations — implemented

UUID create/edit/delete/join/leave use feature APIs/hooks, strict backend payloads, real
verified sessions and explicit confirmation/feedback. Shared form presentation retains
separate real/demo controllers; real games/city IDs and local-to-ISO conversion are validated.
Public lists/homepage refresh, viewer-specific details update from acknowledged responses,
and private leave safely loses access. Account changes abort requests and reject late cache
effects/navigation; old detail reads cannot restore removed addresses. No optimism or numeric
actor authorizes persistent writes. Default covers only until Storage; browser data URLs
remain demo-only. Backend/schema/RLS are unchanged. Focused clients, real multi-user browser
acceptance and database regressions are recorded in [action verification](event-actions-verification.md).

## Milestone 4D: event covers — implemented locally

Private `event-covers` Storage uses verified hosts plus a server-only operation capability,
checked reservations and protected lifecycle records. Backend-mediated uploads validate and
re-encode bounded images; real forms support staged creation/retry and replacement/removal.
Public/unlisted/private access follows event permissions. Backend-only signing limits URLs
to 60 seconds; viewer caches refresh and clear on auth/access changes. Retired objects are
cleaned through supported Storage APIs with bounded retries/tombstones. No service-role
bypass, hosted operation or global cleanup job was introduced. See [implementation](event-covers.md)
and [local verification](event-cover-verification.md). Invitation/role work remains Milestone 5.

## Milestone 5: private invitations and role-authorized access — planned

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

## Milestone 5A

5A host-only codes and private admission are implemented locally. [Verification and limits](private-invitations.md) describe the delivered scope. Admin/superadmin management remains 5B and is not implemented.

## Milestone 5B-1

5B-1 administrative role management is implemented locally; see [administration and verification](administration.md). 5B-2 remains content moderation/reporting/suspension/takedown policy, with separately reviewed private-data permissions. Hosted provisioning/recovery and launch hardening are not implemented.

## Milestone 5B-2A

5B-2A event reports, moderator dismissal and narrow audited cancellation are implemented locally; see [verification](event-moderation.md). 5B-2B or later covers user/account reports, suspension/bans, restoration/appeals, notifications and separately reviewed investigatory access. Hosted controls and deployment remain deferred.

## Milestone 5B-2B

5B-2B application suspension/reinstatement is implemented locally with trusted role restrictions, direct Data API/Storage enforcement and immutable audits. [Verification and limits](account-suspensions.md) distinguish database boundaries from in-flight external work. Deferred: user reports, appeals, notifications, expiry, Auth bans/deletion, hosted recovery and deployment.

## Hosted staging milestones

6A-1 prepares the [controlled rollout](hosted-supabase-staging.md), independent operator
configuration and focused local verification. It performs no hosted changes. The rebased
source includes 5B-2B; the source audit continues to verify its prerequisites.
6A-2 requires separate approval for migrations/reference data/Auth/Storage/secrets/
bootstrap and hosted security acceptance. 6B handles application hosting, final origins,
proxy/CORS decisions and deployment configuration. Neither stage is implied by 6A-1.

## Milestone 6B-1: application deployment preparation

Prepared repository-root Vercel/Render configuration, same-origin API routing, compiled API
startup and [hosting instructions](application-hosting.md). No app hosting was executed.
6A-2 remains partially complete per operator report: database/reference data/keys are provisioned;
verified accounts/bootstrap, hosted Auth/security acceptance and SMTP remain pending.
Hosting protection, final exact Auth origins and proxy smoke checks must be verified before
public/general-tester access. Automatic deployments remain disabled.

Registration follow-up: unique usernames, private DOB, safe Auth errors and dual-service startup are implemented and locally verified. Additive migration 17 and hosted email/PKCE acceptance require separate approval/verification; 6A-2 remains incomplete. See [registration](registration.md).
