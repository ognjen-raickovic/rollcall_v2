# Milestone 5B-2B: application account suspension

Implemented locally on `feat/account-suspensions`. Apply the additive
`20261026000600_account_suspensions.sql` migration without resetting existing data.
No new environment variables, dependencies, hosted setup or Auth Admin API are needed.

## State and policy

An absent suspension row means active. Suspensions are indefinite until explicitly lifted.
Private `account_suspensions` holds the target profile FK, current active/suspended state,
last suspension moderator/time/reason and reinstatement moderator/time/reason. Account
roles remain separate. Events, memberships, reports, profiles and images are not deleted,
cancelled or reassigned. Suspended memberships continue to consume their existing seats.

Active admins may suspend/reinstate ordinary users. Active superadmins may also manage
admins. No caller can change their own state or affect a superadmin through these APIs.
Eligibility uses the target's current role; changing a suspended account's role never
reinstates it. Suspended moderators retain their underlying assignments but cannot use them.
An operationally suspended superadmin is also blocked; recovery needs a separately reviewed
trusted maintenance procedure, not a public endpoint or automatic bypass.

## HTTP contracts

All endpoints require verified Auth and return no-store responses. Inputs are strict.

| Endpoint | Contract |
| --- | --- |
| `GET /api/me/account-status` | Caller only; `{status:"active"|"suspended"}`, with no internal reason |
| `GET /api/admin/account-lookup?userId=<uuid>` | Active moderator; one exact account, `{id,displayName,role,status,canManage}` |
| `POST /api/admin/users/:userId/suspension` | Eligible active moderator; `{reason}` → `{id,status,changed}` |
| `DELETE /api/admin/users/:userId/suspension` | Eligible active moderator; `{reason}` → `{id,status,changed}` |
| `GET /api/admin/suspension-audit` | Bounded `limit` 1–50, optional numeric `before`, UUID `targetId` |

Internal reasons require 5–500 trimmed characters on one line. Repeated assignments are
no-ops (`changed:false`) and do not rewrite reasons or create duplicate audit rows. Admin
audit requests require an eligible exact target; superadmins can also page the overall
history. There is no broad admin user directory, public status field, arbitrary metadata
patch, authoritative actor field or role-changing suspension operation.

Suspended application requests return HTTP 403 with
`{code:"ACCOUNT_SUSPENDED",message:"Your RollCall application access is suspended.",fields:{}}`.
Direct PostgREST uses SQLSTATE `PT403`, HTTP 403 and the safe `ACCOUNT_SUSPENDED` marker.
Unavailable dependencies fail closed. Identity/status checks, SDK logout and ordinary Auth
recovery remain available; Auth sessions are not deleted or banned.

## Database enforcement and concurrency

Fastify's shared Auth guard performs a fresh status lookup after token verification, outside
the invalid-token catch so suspension remains 403. Identity/status endpoints explicitly
bypass only that active-status check. Runtime dependencies are unprivileged caller-scoped
Data API clients; unit fixtures inject the new check explicitly instead of bypassing it in production.

The argument-free volatile SQL `private.require_active_account()` derives the verified
current subject, acquires the existing shared role lock and a UUID-derived shared account
transaction lock, then reads current suspension state with a fresh snapshot. Reviewed
public RPC entry points guard before existing data locks. Role mutation is deliberately
excluded from the generic prelude: its exclusive role lock must come first, followed by its
guarded actor resolver, avoiding shared-to-exclusive upgrade deadlocks.

Existing event/admin actor resolvers delegate to the active guard. Profile RPCs and owner
write/private-age RLS policies are guarded, including direct Data API table writes. Storage
policies already call the guarded event resolver; reservations, commit/removal/cleanup and
signing RPCs are guarded too. Public-safe anonymous geography, catalog, profiles and discovery
remain available. Suspended bearer contexts cannot obtain new member/host private details.
New protected RPCs must explicitly reuse this guard before acquiring their domain locks.

State changes hold the shared role lock, verify the active moderator/current target role,
then take the target's exclusive account lock. Existing role changes cannot race eligibility.
Normal protected operations hold their account's shared lock until commit. Work committed
first is preserved; suspension committed first blocks the later operation, including with
an old JWT. Ordinary operations for other accounts can continue. Existing event locks,
attendance counters and parent-first ordering are unchanged. Role policy prevents permitted
moderators from mutually targeting one another during shared-to-exclusive account locking.

Private `suspension_audit` records immutable actor/target UUID snapshots, action, old/new
state, timestamp and reason. Its select/insert-only executor, RLS/ACLs and immutable triggers
prevent client forgery/update/delete/truncate. State and audit changes are atomic. Actor/target
snapshots survive account deletion; the current-state FK may cascade only if a trusted operator
later deletes an account outside this milestone. Database owners remain trusted operators.
The dedicated status executor has no Auth-schema, private-age/address/code or role-write access.

## Storage boundary

Pre-suspension reservations do not authorize new uploads after suspension. Real Storage RLS
checks take the same account lock, and a waiting upload fails after suspension commits.
Multipart uploads are a multi-request workflow: an object committed before suspension may
remain pending if later attachment/cleanup is blocked. It gains no event association, and
existing recovery/cleanup can resume after reinstatement. External bytes already in flight
cannot be universally recalled; supported Storage APIs and transactional metadata checks
remain authoritative. No signed upload capabilities are issued by RollCall.

Signing authorized before suspension may finish afterward; it remains pre-boundary work.
Already issued signed read URLs retain their existing lifetime of up to 60 seconds. New
protected signing is blocked. Existing objects are not deleted merely because access is suspended.

## Frontend

`/admin/accounts` provides exact UUID lookup, status, eligible suspend/reinstate controls,
native confirmation, internal reason, acknowledged feedback and bounded target audit history.
Protected targets show no action. Existing superadmin role-management pages remain unchanged.

Status queries are keyed by the real UUID and refresh on mount/focus and every 15 seconds
while active. Known suspension replaces protected workflows with a clear explanation,
Check access, public browsing and working logout; recovery paths stay available. Reinstatement
restores the same session after status refresh. Public event reads use anonymous scope while
suspended, rather than retaining membership-derived addresses or cover capabilities.

Shared HTTP errors retain the safe suspension code and notify only for the initiating UUID.
The status synchronizer checks both the current render and Auth cache identity before accepting
that notification, and removes private event/cover/profile/admin queries on detection. Auth
transitions remove status queries as well; late A responses cannot populate B. Reasons/tokens
never appear in query keys or URLs. Client presentation is not the enforcement boundary.

## Verification and limits

Local migration/refinements and SQL lint passed, with 416 SQL assertions. SQL fixtures now
mark only their synthetic accounts confirmed before simulating protected sessions. Focused
real tests cover the old-JWT HTTP/RPC matrix, raw profile/experience writes, pre-reserved
Storage writes, role restrictions, privacy, preservation, reinstatement, idempotency, immutable
audits and rollback. Genuine lock waits cover joining/creation/private redemption in both
orders, Storage upload versus suspension, role eligibility and conflicting state changes.

Use `RUN_LOCAL_INTEGRATION=true` with backend `tests/integration/suspensions.test.ts`.
`pnpm test:suspensions` runs frontend client isolation/response-contract checks.
`RUN_LOCAL_SUSPENSIONS_UI=true` enables the two browser projects `375-dark`/`1440-light`
in `tests/suspensions-ui.spec.mjs`; tracing, screenshots and video are disabled. One mobile
check initially timed out at a generic private-event load error; its focused rerun added an
independent backend 404 assertion and passed all privacy assertions. No assertion was relaxed.
Final typecheck, lint (including boundaries) and build passed. Frontend client suites passed
40 reported results, including four new status-client results. All eight existing integration
modules passed 43 reported results. The new suspension module passed seven results on its
focused final rerun, including the actual Storage lock wait. The initial combined run failed
that module because its raw experience PATCH named a nonexistent column; the corrected test
now verifies the real owner-write denial, without weakening the expected 403.
The backend unit run had 42/43 passing results; its standalone cover-route fixture lacked
the new guard dependency. After explicitly injecting that test dependency, the focused cover
module passed 5/5. The complete unit/integration groups were not repeated after these fixture
corrections. Desktop browser acceptance passed; the focused mobile acceptance rerun passed.
No unresolved authorization, audit-integrity or concurrency failure remains in executed checks.

Main additions: backend account-status service/suspension routes, the additive migration,
SQL/unit/integration tests; frontend status API/hooks/synchronizer, account-access/history,
suspended screen/notice and client/browser tests. Existing Auth guards/error adapters,
viewer-aware HTTP calls, route composition and shared documents were updated. SQL test
accounts now explicitly simulate confirmed sessions; unrelated production data is unchanged.
The milestone is ready for PR review, not hosted deployment.

Temporary fixtures use trusted maintenance cleanup scoped to their own IDs and supported
Storage removal. No personal account, hosted resource, populated database reset or GeoNames
reimport is involved. Deferred: user reports, appeals, notifications, scheduled expiry, Auth
bans/deletion, hosted operational recovery and deployment. No automatic event cancellation is added.
