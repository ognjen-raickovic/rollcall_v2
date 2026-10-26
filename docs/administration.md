# Milestone 5B-1: administrative roles

This milestone implements role management locally. It does not add moderation powers,
hosted provisioning or deployment. Existing event, profile and Storage authorization is unchanged.

## Roles and permissions

| Role | Administrative landing | List accounts / inspect audit | Change user ↔ admin |
| --- | --- | --- | --- |
| user (including no assignment) | No | No | No |
| admin | Yes | No | No |
| superadmin | Yes | Yes | Yes |

The existing `private.account_roles` table is authoritative. Editable Auth metadata,
public profiles, JWT role hints, numeric demos and browser preferences grant no application
privileges. Even superadmins cannot use these APIs to change themselves, modify another
superadmin or appoint a superadmin. Missing assignments resolve to user; deleted/unconfirmed
accounts fail closed. No email, birth year or unrelated Auth metadata appears in admin lists.

## Local first-superadmin setup

Apply local migrations without resetting/importing data. Register and confirm the intended
account normally, then obtain its UUID privately from your own profile/local operator tools.
Choose the account deliberately; the application never chooses or creates one for you.

The existing ignored `backend/.env` maintenance setting `GEOGRAPHY_DATABASE_URL` must use
a trusted operator connection to literal `127.0.0.1` or `[::1]`, with no URL options. Hostnames
(including localhost) are rejected to avoid DNS/connection-option ambiguity. No new secret is needed.

From the repository root, replace the placeholder before running:

```powershell
pnpm.cmd admin:bootstrap --user-id=<confirmed-account-uuid> --confirm=INITIALIZE_LOCAL_SUPERADMIN
```

The explicit confirmation is required. The command parameterizes the UUID, prints no
credentials or target identifier, and calls an unexposed maintenance function. It refuses
unconfirmed/missing accounts, a configured superadmin, or an existing bootstrap audit record
(even if the initial account was deleted). Repeated initialization is refused without writes.
There is no public bootstrap endpoint, default administrator or seed-created privileged account.
Recovery/additional superadmins and hosted provisioning require a separately reviewed procedure.
Never reuse the maintenance database connection in API request handling.

## HTTP and database contracts

All endpoints require verified Supabase Auth and return `Cache-Control: no-store`.

| Endpoint | Contract |
| --- | --- |
| `GET /api/me/permissions` | `{role,capabilities:{accessAdmin,manageAdminRoles}}` for caller only |
| `GET /api/admin/users` | Superadmin; `limit` 1–50 (default 20), optional UUID `after`/exact `userId`; `{items,nextCursor}` |
| `PATCH /api/admin/users/:userId/role` | Superadmin; strict `{role:"user"\|"admin"}`; `{id,role,changed}` |
| `GET /api/admin/role-audit` | Superadmin; bounded `limit`, optional descending numeric `before` and exact UUID `targetId`; `{items,nextCursor}` |

Account items contain only UUID, display name, role and profile creation time. Confirmed
accounts are ordered by UUID; no email/name search is added. Audit items contain string ID,
actor/target UUID snapshots, previous/new roles, action, source and timestamp. Bootstrap has
no account actor and uses the controlled `local_operator` source. No arbitrary audit writer exists.
Unknown query/body fields and invalid values are rejected. Repeating an assignment is a
successful no-op (`changed:false`) and creates no duplicate audit. Unsupported/self/superadmin
changes fail with 400; nonexistent targets 404; missing identity 401; insufficient permission
403; database failures use sanitized 503 responses.

Two additive migrations introduce a NOLOGIN/NOBYPASSRLS administrative executor, private
RLS-protected audit table, restricted functions, and narrow Auth confirmation helpers.
Supabase owns the Auth schema separately: the executor has no raw Auth access. Internal
schema-qualified, argument-free identity and boolean confirmation helpers expose no email
or metadata and are not client-executable. Public RPC wrappers are invoker-only; their
private operations independently check the verified identity/current database role, so
calling PostgREST directly cannot bypass Fastify authorization. No service-role client is added.

Bootstrap and role mutations share one transaction-scoped advisory lock. Role authorization
is rechecked after acquiring it, conflicting changes serialize, and role writes plus successful
audit inserts commit together. Audit failure rolls back the role. API roles cannot write,
forge, update, delete or truncate audit history; executor grants allow only select/insert.
Triggers reject updates/deletes/truncation. UUID snapshots survive account deletion.
A database owner remains a trusted operator capable of altering database protections.

## UI and revocation

`/admin` is a minimal landing page for admins/superadmins; `/admin/users` and
`/admin/role-audit` require superadmin. Navbar Admin appears only with acknowledged permission.
Users get a restricted state; unauthenticated visitors use real login. No fake moderation tools.
Role changes require a native confirmation dialog with Cancel initially focused. Lists provide
bounded paging, exact UUID lookup, loading/error/retry/empty states and save feedback.

Permissions refresh on focus/mount and every 30 seconds while active. Demotion immediately
blocks future server operations using the same JWT; UI refresh does not require logout.
Queries are viewer-keyed, abortable and discarded when inactive; Auth transitions remove
the administration prefix before the replacement account renders. Reads and writes recheck
the initiating UUID after HTTP. Mutations are not optimistic and invalidate permissions/lists/audit.
Previously rendered permissions may remain visible until refresh; they never authorize requests.

## Verification

Local migration application and SQL lint passed. All 373 SQL assertions passed, including
20 new administrative ACL/RLS/immutability checks. Real database-backed tests cover bootstrap,
metadata/anonymous/direct-RPC attacks, transitions, demotion with the same token, pagination,
concurrent conflicting updates, audit rollback, deleted accounts, repeated bootstrap and
private profile/event/invitation/cover boundaries. Unit tests exercise local bootstrap inputs.
Browser journeys at 375px dark and 1440px light cover promotion, persistence, audit, admin/user
denial, demotion, dialogs/Escape, loading/error/retry/empty states, and a delayed superadmin
response released after logout/login as a different account. Traces are disabled for Auth safety.
See the final handoff for completed regression/check totals and any outstanding limits.

Tests use synthetic local accounts only and refuse existing superadmin configuration.
Run administrative integration and browser suites sequentially, never concurrently: each
deliberately owns the single synthetic local bootstrap lifecycle. Run backend integration
with `RUN_LOCAL_INTEGRATION=true` and `--test-concurrency=1`; the browser suite requires
`RUN_LOCAL_ADMIN_UI=true` and `tests/administration-ui.spec.mjs`.
Fixture cleanup uses trusted maintenance-only trigger bypass inside a transaction to delete
only synthetic audit rows; this is not an application capability. No personal admin is provisioned.

Final checks passed: frontend/backend typecheck, lint (including feature boundaries), build,
41 backend unit tests, 35 real integration results across seven modules, 43 frontend
mock/profile/event/action/cover client results, 373 SQL assertions and two representative
browser journeys. The final focused administration rerun passed all eight results. Browser
screenshots were visually reviewed; mobile lookup was widened and reverified. The first
SQL implementation failed closed at Supabase Auth ownership; the narrow-helper migration
resolved it. One concurrent UI/API fixture run was safely refused; serial verification passed.
Other viewport/theme combinations and unrelated legacy browser suites were not rerun.
The milestone is ready for PR review, with no hosted operations or personal provisioning.

## Deferred to 5B-2 or later

Content moderation, reports, suspension, event takedowns, extra private-data access, broader
administrative roles, hosted provisioning/recovery, production abuse controls and deployment
remain separate work. No blanket admin override was added.

## Milestone 5B-2A

5B-2A now extends accessAdmin to the reported-event review/dismiss/cancel workflow at /admin/reports. This is an explicit narrow cancellation policy, not a general event/privacy override. Current roles are checked again inside SQL; role locks coordinate demotion with pending decisions. Role-management permissions remain superadmin-only. See [moderation scope and verification](event-moderation.md); suspension, broader investigation and deployment remain deferred.
