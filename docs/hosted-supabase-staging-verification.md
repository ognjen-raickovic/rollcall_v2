# Milestone 6A-1 verification

Verified locally on 2026-10-26, branch `feat/hosted-supabase-setup`. **No hosted deployment
or remote mutation occurred.** No CLI project link, hosted import, bucket/Auth change,
staging secret provisioning, hosted bootstrap or application deployment was performed.
The MCP connection was not exposed in the session's available tools; no remote inspection
was attempted without confirmed scope/read-only configuration.

## Source baseline and rollout status

The original 6A-1 verification used baseline `22ddb7c`, through 5B-2A, before full 5B-2B
integration. Its reviewed SQL/tests from local commit `d29f46b` were copied **only into an
ignored disposable replay directory**. No milestone merge/cherry-pick or branch change
occurred during that original verification.

The subsequent rebase onto updated `main` (`8516684`) brings the complete 5B-2B source,
including migration `20261026000600_account_suspensions.sql`, into the combined tree.
The source audit still enforces those prerequisites. The executed checks below describe
the original verification, not a full regression rerun during conflict resolution.

6A-1 preparation is ready for PR review; the missing-source blocker is resolved in the
combined tree. Hosted preflight and separate 6A-2 authorization remain required.
Local success does not prove managed hosted migration-role privileges.

Rebase reconciliation checks: all updated-main content in the nine conflicted documentation
files was preserved verbatim, both package script/dependency sets were retained, and the
offline staging source audit passed with no blockers. Historical migrations and application
code were unchanged. Full regression/database/browser suites were not rerun for this
documentation/package conflict resolution; no database connection or hosted operation occurred.

## Final integrated review after rebase

Reviewed `49ad69f` on `feat/hosted-supabase-setup` against `main` (`8516684`). All 5B-2B
application code, tests and historical migrations are unchanged from that base. The staging
provisioning migration is the only migration added by 6A-1, follows account suspensions,
and grants no runtime/client access. Existing RLS, Auth and Storage policies were not edited.
The rollout guide describes the integrated source correctly; its hosted prerequisites remain.

| Focused integration check | Result |
| --- | --- |
| Root typecheck, lint and build | Passed for frontend/backend, including feature boundaries. |
| Staging/suspension backend unit checks | Six tests passed, including explicit integrated-source success and missing-prerequisite refusal. |
| Frontend suspension API checks (`pnpm test:suspensions`) | Four tests passed; client privacy, initiating-viewer attribution and stale response protection. No browser suite run. |
| Source audit and catalog/key previews | Passed offline with no source blockers; no actual staging keys generated or hosted connection attempted. |
| Fresh integrated migration replay | All 16 repository migrations applied in order on a new, seedless disposable local project. No existing database reset. |
| Staging PostgreSQL integration | Both tests passed: catalog identity/retry, private provisioning/key conflicts, tiny import identity/alias stability, confirmed/active bootstrap and concurrent suspension/role-lock handling. |
| Suspension integration | Seven TAP tests passed (parent plus six scenarios), using real local Auth, Fastify, PostgREST and Storage. Verified old-JWT denial, direct Data API/raw-table protections, preservation/reinstatement, privileged actor denial, both suspension/admission commit orders, reserved-upload rejection after suspension, role eligibility serialization and audit rollback/immutability. |
| Targeted SQL security suites | Four files / 115 assertions passed: suspensions, staging, administration and event covers. |
| Disposable schema lint | No schema errors at warning/fail-on-warning level. |

Only the staging audit regression test and this consolidated verification report were changed
for this review; no application or migration implementation changed. Test fixtures and
temporary runtime keys were confined to the isolated local project/process. No local `.env`
file was edited, no full geographic dataset was imported, and no hosted resource was changed.
The disposable project was stopped after verification. Historical full-suite results below
remain original evidence, not a claim that those full suites were rerun here.

6A-1 is ready for PR review with no integration/security failure found in these checks.
Before 6A-2, obtain separate authorization and verify the intended hosted project's scope,
migration history, extension placement/digest and Storage helper availability, managed-role/
Auth-trigger/Storage-policy privileges, Data API exposure/RLS settings and TLS maintenance
connection. Actual hosted Auth email delivery, Storage operations and the complete hosted
security acceptance checklist remain unexecuted. Final application hosting/origins remain 6B.

## Changed deliverables

- `backend/scripts/staging/`: source/hash audit, fail-closed target validation, essential catalog,
  offline manifest validation, independent key generation/provisioning, serialized bootstrap,
  dry-run-by-default CLI. Existing local-only scripts and runtime API remain unchanged.
- Root/backend package scripts expose `pnpm staging:prepare`; no build/startup import hook.
- `backend/.env.staging-operator.example` contains placeholders; `.gitignore` excludes all of
  `backend/.staging/`, including credentials, keys, CA files and private operator evidence.
- Additive migration `20261026000700_staging_provisioning.sql`: private operator-only
  provisioning fingerprints. No historical migration was edited.
- Read-only `supabase/staging/preflight.sql`, focused unit/integration tests and nine SQL
  provisioning ACL/RLS assertions. Documentation/instructions point to one
  [main rollout procedure](hosted-supabase-staging.md).

## Executed checks

| Check | Actual result |
| --- | --- |
| Frontend/backend `pnpm typecheck`, `pnpm lint`, `pnpm build` | Passed, including feature boundaries and production frontend build. |
| `pnpm test:backend` | 46 tests passed, including four staging unit tests. Backend API tests use controlled/mocked dependencies, not hosted services. |
| Fresh isolated migration replay | All 14 baseline migrations applied in order, then the separately committed 5B-2B SQL and proposed staging migration. Development seed disabled. No reset of the existing database. |
| Disposable PostgreSQL catalog/provision/import test | Passed: inserts eight games, retry inserts zero, collision refuses overwrite, sequence stays ahead; exact key provisioning retries succeed and changed roots fail; private ledger ACL/RLS and Storage limits/helpers verified; tiny city import retry preserves ID/alias without duplicates. No real staging keys used. |
| Disposable PostgreSQL bootstrap test | Passed: unconfirmed/suspended accounts rejected; concurrent suspension holds the shared role lock, bootstrap waits and rejects the newly suspended account; successful active confirmed bootstrap audited once; repeat initialization rejected. Temporary accounts deleted; immutable test audit remains only in disposable database. |
| SQL regression on disposable project | **12 files / 425 assertions passed**, covering foundation, geography, Auth, profiles, event APIs, attendance, covers, invitations, administration, moderation, suspensions and staging ACLs. 5B-2B fixtures came from `d29f46b`, not the unintegrated working tree. |
| Disposable schema lint | `db lint --local --level warning --fail-on warning`: no schema errors in public/private/extensions. |
| Four-country offline dry-run | Cached ME/RS/BA/HR ZIP and extracted-text SHA-256 values matched the tracked manifest; 4,000 / 9,489 / 21,389 / 11,363 eligible places, total 46,241. No download/full import. |
| Existing populated local database | Read-only inspection: 46,243 cities, 23,401 aliases, eight games; zero accounts/profiles/events/memberships/invitations/role/moderation/suspension records and zero cover objects. No writes, resets or full reimports targeted this database. |
| Commit-eligible local-key scan | No file contained the existing local invitation or cover operation key. No actual staging credentials/reference added to tracked files. |

The isolated project used a separate random `rollcall_stageprep_*` ID and ports 60320–60324.
Local images: Supabase PostgreSQL `17.11.0.006`, Storage `v1.84.19`, PostgREST `v16.5`,
Auth `v2.197.0`. Read-only preflight executed successfully (10 metadata result sets); local
`postgres` is non-superuser with CREATE ROLE. These are evidence about the local stack only.
The disposable SQL suite uses
development city fixtures after the seedless catalog test; the staging initializer never
copies those fixtures. The isolated project is stopped after verification.

Windows sandbox `tsx` initially failed before tests with `uv_os_get_passwd`; executing the
same focused tests with approved OS access succeeded. This was not an application test failure.
No UI changed, so browser/Playwright suites were not rerun. No hosted TLS handshake, pooler,
SMTP delivery, physical hosted upload or hosted security smoke test is claimed.

## Reproducing the isolated checks

Using the combined 5B-2B/6A-1 source, create a **new ignored work directory** under `backend/.tmp`.
Copy `supabase/config.toml`, migrations and SQL tests into its `supabase/` subdirectory.
Choose a unique project ID distinct from `rollcall` and free ports (these tests reserve DB
60322); disable `db.seed` and Studio. Start with `pnpm exec supabase start --workdir <DIR>`.
Never run a root reset or change the populated project's ID/ports. Inspect the resolved path
and unique project ID before any stop/cleanup command.

On that fresh, seedless database, run `backend/tests/integration/staging.test.ts` with
`ROLLCALL_DISPOSABLE_STAGING_TEST=true` and a privately supplied loopback
`GEOGRAPHY_DATABASE_URL` on port 60322. It intentionally refuses the ordinary local DB and
requires empty catalog/cities/accounts/events. Add only the city fixture insert from the
development seed for the historical SQL assertions; games were installed by the catalog test.
Run the copied SQL suite with `supabase test db --workdir <DIR>` and schema lint with
`supabase db lint --local --level warning --fail-on warning --workdir <DIR>`.
These are disposable-fixture operations, never hosted smoke-test commands.

Offline source validation is `pnpm staging:prepare geography --target=staging
--directory=<CACHED_COUNTRY_ARCHIVE_DIRECTORY>` (one command; directory relative to backend).
No operator configuration/DB connection is required. Run backend unit tests and normal
typecheck/lint/build once. Stop only the verified disposable project, leaving ordinary local
Supabase running; do not publish CLI startup output containing credentials.

## Pending hosted gates

Verify the combined source audit, the intended project and preflight metadata, then explicitly approve
6A-2. Hosted role creation/ownership grants, Auth trigger privilege, extension placement,
Storage helper/policy ownership, TLS/session-pooler connectivity, disabled automatic exposure,
enabled automatic RLS, actual Auth email delivery and the complete direct Data API/Storage
security acceptance checklist remain pending. Final frontend/API origins, proxy/CORS and
application hosting remain 6B. Use the exact ordered steps in the main guide; do not infer
deployment approval from this report.
