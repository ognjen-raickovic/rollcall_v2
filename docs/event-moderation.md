# Milestone 5B-2A: event reporting and moderation

Implemented locally on `feat/event-moderation`. No hosted resources, personal administrator,
account suspension, general admin editing or deployment is introduced. Apply the additive
`20261026000500_event_moderation.sql` migration locally; existing Auth/role configuration
is reused and no new environment variable or dependency is required.

## Reporting policy and fields

Real confirmed UUID accounts can report events they can currently view. Public/unlisted
events are accessible; private events require the host or a current participant. Hosts may
report their own events. Administrative role alone never grants private-event reporting access.
Inaccessible private UUIDs and nonexistent UUIDs produce identical 404 responses.

Reasons: `inappropriate`, `spam`, `harassment`, `unsafe`, `other`. Optional description is
trimmed, bounded to 1000 characters and rendered as plain escaped text. Normal line breaks
are allowed; unsupported control characters are rejected. The UI warns against including
addresses, room codes or unnecessary personal details. Free text is self-declared evidence,
not verified fact, and may still contain personal information voluntarily entered by a user.

Private `event_reports` stores UUID, nullable live event/profile FKs, immutable target UUID,
reason/description, a safe event snapshot, status, timestamps and resolution metadata.
Snapshots contain only title, game name, start time and visibility. No automatic snapshot
of description, host identity, participants, exact address, cover URL or room code is made.
Reporter UUIDs are never included in API projections, including moderator responses.

One open report per account/event is enforced with a partial unique index and transaction
locks. Repeated submission returns the existing receipt without changing its contents.
After resolution, a later report may be submitted, subject to throttling. There is no public
report lookup, host report list or user-controlled reporter identity.

## API contracts

All endpoints require verified Auth and return no-store responses. Inputs are strict.

| Endpoint | Access / response |
| --- | --- |
| `POST /api/events/:eventId/reports` | Accessible event; `{reason,description?}` → `{id,created}`; 201 first, 200 duplicate |
| `GET /api/admin/event-reports` | Admin/superadmin; bounded queue `{items,nextCursor}` |
| `GET /api/admin/event-reports/:reportId` | Admin/superadmin; safe context, decision metadata and history |
| `POST /api/admin/event-reports/:reportId/dismiss` | Admin/superadmin; `{note}` closes without event changes |
| `POST /api/admin/event-reports/:reportId/take-action` | Admin/superadmin; `{note}` cancels only that report's event |

Queue filters: `status=open|dismissed|actioned|all` (default open), `limit=1..50`
(default 20), paired `beforeTime`/`beforeId` cursor. Ordering is newest timestamp then UUID.
Cursor timestamps retain PostgreSQL precision. No unrestricted event/user lookup is added.
Internal decision notes require 5–500 trimmed characters on one line. No event ID, actor,
status override or arbitrary patch is accepted in decision bodies.

Statuses are `open`, `dismissed`, `actioned`. Decisions return `{id,eventId,status,changed}`.
Repeating the same decision is a no-op with `changed:false`; a conflicting decision returns
409. Cancellation of an already-cancelled event resolves the report with `eventChanged:false`
in its audit. A deleted event cannot be cancelled (409), but its report may be dismissed.
Invalid input is 400, missing identity 401, insufficient role 403 and missing report 404.
Dependencies fail with sanitized 503 responses. Failed requests never acknowledge success.

## Security, throttling and atomicity

A separate NOLOGIN/NOBYPASSRLS moderation executor has column-limited event reads and only
`UPDATE(status)`, restricted membership/catalog reads, private report/limiter access and
select/insert audit privileges. RLS and explicit grants close all raw tables to API roles.
It has no private address, invitation, age, raw Auth or role-write grants. Existing narrow
identity/current-permission helpers are reused; existing event constraints remain enforced.
Public RPC wrappers are invoker-only. Private operations independently verify access and
current database roles, so direct PostgREST calls cannot bypass the API's authorization.

The durable account limiter allows ten well-formed submission attempts per fixed 15-minute
window, including duplicates and inaccessible UUIDs. Unavailable/limited outcomes return SQL
data so attempt writes commit; the backend maps limits to 429 with Retry-After 900. Invalid
input rejected before verification need not consume attempts. Limits are shared across API
instances/restarts. Additional shared network-level abuse controls and signup/IP policy
remain deployment requirements; an account limiter alone cannot stop many-account abuse.

Moderation takes a shared transaction lock coordinated with role changes, checks current
permissions, locks the parent event, then the report. Submission/deletion/attendance use
the same parent-first ordering. Cancellation, audit insertion and report resolution commit
together; any failure rolls everything back. Existing attendance triggers remain the sole
counter writers. Joining committed first retains its seat; cancellation committed first
prevents admission. Existing memberships are not ejected. Competing decisions serialize.

Cancellation uses the existing event status, automatically revokes private invitation
admission and removes the event from scheduled public discovery. A guarded status trigger
prevents host reactivation after an audited moderation cancellation. Hosts retain normal
editing of cancelled metadata and deletion; restoration requires a separately reviewed
future policy. No ordinary host PATCH permission was expanded for moderators.

Private `moderation_audit` is append-only: verified actor, report/target UUID, action,
previous/new status, safe internal explanation, eventChanged and timestamp. No generic audit
writer exists. Triggers and ACLs reject update/delete/truncate. Event deletion sets the live
report FK to null while snapshots/audit survive; reporter deletion sets its FK to null.
Audit target/actor snapshots intentionally survive account deletion. Trusted database owners
can alter protections; they remain outside the application-client threat boundary.

## Frontend and privacy

Real event details provide a native Report Event dialog, reason selector, optional bounded
details, pending/error/success feedback and keyboard focus handling. Anonymous visitors use
real login with a nonsecret resume flag. Numeric demos have no reporting controls.
`/admin/reports` extends existing administration with queue filters/pagination, limited review,
history and confirmed dismissal/cancellation. There are no fabricated metrics or private-content links.

Moderator queries use the existing viewer-scoped administration prefix and no inactive
retention. Auth changes abort/remove old queries before the replacement account renders;
reads/writes recheck the initiating UUID. A demotion blocks subsequent HTTP and direct RPC
operations without logout. Permission presentation refreshes using the existing 5B-1 policy.
Successful decisions invalidate administration/discovery and discard event details/signed-cover
queries. Other browsers refresh through their normal fetch/focus lifecycle; no push is added.
Existing signed cover URLs retain their short 60-second validity window. Moderation APIs
never issue them. Report content and internal reasons are never included in public event DTOs.

## Verification and remaining scope

Run `pnpm test:moderation` for focused frontend client contracts. Local database integration
uses `RUN_LOCAL_INTEGRATION=true` with `tests/integration/moderation.test.ts`. Browser
verification uses `RUN_LOCAL_MODERATION_UI=true`, `tests/moderation-ui.spec.mjs`, and projects
`375-dark` / `1440-light`. Run database-backed fixture suites sequentially, particularly the
5B-1 bootstrap suite. Temporary accounts/roles are synthetic; cleanup targets only their
record IDs using trusted maintenance privileges, never production API bypasses.

Final results: frontend/backend typecheck, lint (including feature boundaries) and build passed;
SQL lint and all 395 SQL assertions passed. The final regression pass passed 42 backend unit
results, 43 real integration results across eight modules and 36 frontend client results
(including five new report/moderation results). Both requested browser journeys passed after
the final component split, with viewport overflow checked inside the reporting/review flows.
Coverage includes direct Data API denial,
private concealment, durable throttles, idempotency, audited cancellation, deletion, demotion,
account switching, genuine PostgreSQL lock contention and failure rollback. Browser traces,
screenshots and videos are disabled. No GeoNames import or unrelated legacy browser suite
was rerun. Narrow helper/catalog/constraint grants were corrected after initial fail-closed tests.

Main additions: backend `modules/moderation` schemas/repository/routes, real integration/unit
and SQL tests, frontend events report API/hook/dialog, users moderation API/hooks/dashboard/
review, shared reason labels and focused client/browser tests. Existing app registration,
database contracts, admin routing/navigation, event details and safe conflict handling were
updated alongside README/SPEC/entity/security documents and shared assistant instructions.
Local fixture cleanup preserved the geography catalog and removed temporary accounts, roles,
events, reports and audit fixtures. Milestone 5B-2A is ready for PR review; no deployment
readiness or hosted provisioning is implied.

5B-2B or later: account/user reports, suspension/bans, notifications, broader investigation,
moderation restoration/appeals, hosted abuse controls, provisioning and deployment. No such
capability is implicitly granted by this milestone.
