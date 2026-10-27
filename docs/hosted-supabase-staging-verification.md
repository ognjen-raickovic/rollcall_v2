# Milestone 6A-1 verification

## Hosted Auth compatibility correction (2026-10-27)

On `feat/hosted-staging-rollout`, corrected the initial, not-yet-hosted history explicitly:

- `20261025000200_events_api.sql`: removed Auth schema USAGE/auth.uid EXECUTE grants;
  created the existing postgres-owned, argument-free subject helper before first use and
  routed all executor event functions/policies through it.
- `20261025000300_event_executor_identity.sql`: CREATE OR REPLACE reuses that early helper.
- `20261026000300_administrative_roles.sql`: removed Auth schema/column grants, moved the
  existing confirmed-subject/target-confirmation helpers before first use, and replaced
  executor Auth joins with those narrow predicates. Maintenance-only bootstrap is unchanged.
- `20261026000400_admin_verified_identity.sql`: preserved legacy column cleanup; schema
  revocation runs only when postgres can delegate it, and unexpected remaining executor
  Auth-schema access fails closed. No managed ownership/membership changes are introduced.

This is an exception to preserving historical SQL, justified before the first hosted apply:
unsupported GRANTs may warn/no-op rather than abort DDL, leaving unusable earlier executor
functions/policies before the later helper migration runs. An appended migration does not
repair that intermediate dependency or remove unsupported statements from the initial path.
No new migration/version was added. The populated local database was not migrated/reset;
its already-applied final helpers remain equivalent. Do not force-replay history or repair
version records. Old approved inventories are superseded; review the changed SQL and new
checkout checksums, rerun the offline source audit and linked dry-run before hosted approval.
The audit now rejects reintroduced direct managed-Auth GRANTs; existing role/status gates stay.

Executed on a fresh disposable local project, using all 16 corrected source migrations:

- Passed two intermediate boundary checks, before each following identity migration:
  custom event/admin roles resolved their own caller/confirmation without Auth schema USAGE.
  Temporary executor assumption and synthetic confirmed users were rolled back.
- Local capability metadata matched the relevant hosted restriction: postgres had neither
  Auth schema USAGE grant option nor auth.uid EXECUTE grant option. Storage owner privileges
  were false, while the supported Supautils policy exception was true. Actual policy creation
  succeeded with managed Storage ownership intact.
- Eight focused SQL suites / **242 assertions passed**, including ten new helper/ACL/search-path
  assertions, Auth, profiles, event API, administration, covers, suspensions and staging security.
- Real local Auth/Fastify/PostgREST/Storage suspension integration: **seven TAP tests passed**,
  including old-JWT denial, both admission/suspension commit orders, reserved uploads,
  moderator role serialization and atomic immutable audits.
- Five staging unit tests and offline source audit passed. Root typecheck/lint/build passed.
  Schema lint found no errors; the updated preflight executed successfully locally (12 result sets).
  No browser suite or full geographic import was run. No administrator bootstrap or actual
  staging key provisioning was run; security tests used disposable process-only fixtures.

Supporting changes are in `backend/scripts/staging/audit.ts`, `backend/tests/staging.test.ts`,
`supabase/staging/preflight.sql`, `supabase/tests/database/hosted-identity.test.sql` and the two
staging documents. No Storage policy, application runtime, role eligibility or suspension
implementation was changed.

Hosted automatic-RLS evidence is consistent with a compatible enable-only trigger. It was
not modified or disabled. Storage policy support is documented by Supautils, not inferred
from ordinary ownership; the actual hosted `supautils.policy_grants`, Storage delegation
privileges and effective migration identity still need the updated read-only preflight.
Missing supported privileges remain a blocker for hosted apply. Digest delegation/effective
EXECUTE should also be checked. No remote SQL, migration preview/apply, Auth/Storage change
or local `.env` edit was performed during this correction. The disposable instance was stopped.

Updated inventory below is SHA-256 of the exact operator-checkout SQL bytes, matching
`pnpm staging:prepare audit --target=staging`; line-ending changes also change these values.
Regenerate/review at the actual deployment checkout. Existing local version records are not
proof that these revised bytes executed there. Git retains the original source for comparison.

| Migration | SHA-256 |
| --- | --- |
| `20261024000100_initial_schema.sql` | `5b7034c82b85f4120a61623fdf7222c6583209377bf8868a6efa47ab611afbb2` |
| `20261024000200_geography_search.sql` | `bcb355cbb6ba8cbecad8e475f522fbe4d3cedb26e3dea3074ea52d4eff92d1eb` |
| `20261024000300_balkan_geography.sql` | `f3ca20858aa349b41efc78a26a615bca392a12daee704b241c30d4392d54add2` |
| `20261024000400_auth_profile_initialization.sql` | `7615c0713099409a49d1d3bd5e458a2fbded4c64d54fc0e811cc64d2ac9574b9` |
| `20261025000100_user_profiles.sql` | `c54d5bf460d62eba46ce32e2d08def1713de00c3c0ebfb20298ec55aa2648f01` |
| `20261025000200_events_api.sql` | `e3866f28052b70dd7a1808865850e3b4b25abcfb233c93b6d7864be186933a80` |
| `20261025000300_event_executor_identity.sql` | `6de8a61b7af3d259f226524b0569214e8d687dfa142f7dc85be5088d3d81479d` |
| `20261025000400_event_attendance.sql` | `03f57507986c5c8fb3ee6c12132fc438ac3fa35b9f5cbdba0a75b10e16b7c19a` |
| `20261025000500_attendance_private_recheck.sql` | `bb1a65c1f2bde6bd08706b3f68eab3253638d499ac7f12686232d50ada31c260` |
| `20261026000100_event_covers.sql` | `c28d8177ceb67e7d6d761c13c65becb72b7636ded2e43d4afccbca9f276fef08` |
| `20261026000200_private_invitations.sql` | `44df20fe84b0bcf8b73bdada94701e827d475fa1c5dd1f614c0447c2935f9000` |
| `20261026000300_administrative_roles.sql` | `a1435707b7efbaf0978beb4b0f73b2f159240ed2892ac53f85a37ae20631511c` |
| `20261026000400_admin_verified_identity.sql` | `4fad9c09312af011090bf88755d1935610ece5b38cd7d99f1141953a10400432` |
| `20261026000500_event_moderation.sql` | `ad958f33e7df67b288ae523ed0161b74c496fedb48fb9272c9ea82a429079552` |
| `20261026000600_account_suspensions.sql` | `5ad7f315b18be0033a7dfc5b8cffda2c7d479102508678f91018fb2396b65d44` |
| `20261026000700_staging_provisioning.sql` | `bc7cb4b1e5d70a5b0e283e112ca45086c60c1ec5d6fbc0dfa84776a9dc0e9598` |

Earlier sections below are historical verification evidence, not results for revised SQL.

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
