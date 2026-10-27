# Hosted Supabase staging: reviewed rollout procedure

Milestone 6A-1 prepares this procedure; **it does not authorize or execute hosted changes**.
Milestone 6A-2 requires separate approval. The intended project is `rollcall-dev` in the
Lingora organization, never production. No real project reference or credentials belong here.
Frontend/backend hosting is Milestone 6B. Keep the existing local `.env` files and populated
local database unchanged. See [local verification](hosted-supabase-staging-verification.md).

## Stop conditions and prerequisites

- The rebased source includes 5B-2B account suspension/reinstatement from updated `main`,
  alongside 6A-1 preparation. Run `pnpm staging:prepare audit --target=staging` to verify its
  migration, runtime status module, documentation and Fastify registration remain present.
  Missing prerequisites still block writes; do not copy just a migration to bypass the audit.
- Supabase MCP was not exposed among this session's tools. No hosted inspection occurred.
  If available later, first verify its exact project reference and read-only configuration.
  A connected account alone proves neither. Otherwise use Dashboard read-only inspection.
- Use the repository-pinned Supabase CLI 2.122.0, Node 22.12+, pnpm, reviewed source and
  privately retained manifest hashes. Record project identity, region, database/version,
  current migration history and any existing data before approval. Stop on unexpected
  schema/data/history or a project other than the explicitly approved staging reference.
- Have a maintenance window, recovery owner, secure key backup and backup/restore plan
  appropriate to the project's plan. A new empty staging database is expected, not assumed.

## Migration audit in chronological order

Four historical files have an explicitly reviewed pre-first-hosted-rollout Auth compatibility
correction; see the [dated verification and checksum inventory](hosted-supabase-staging-verification.md#hosted-auth-compatibility-correction-2026-10-27).
The migration count/timestamps remain unchanged. The following findings apply to a fresh Supabase
database with Auth and Storage installed, executed as the project's maintenance `postgres`
role. The local replay establishes SQL behavior, not hosted ownership privileges.

| Migration suffix | Relevant dependencies and finding |
| --- | --- |
| `20261024000100_initial_schema` | Creates `private`, `unaccent` in `extensions`, UUID Auth FK, tables/triggers/RLS. Revokes permissive defaults for `postgres`; grants only explicit geography reads. Requires Auth and extension privileges. |
| `20261024000200_geography_search` | Installs the four country records and explicitly grants bounded city search. No development cities. |
| `20261024000300_balkan_geography` | `pg_trgm` in `extensions`, additive provenance/aliases/search indexes and read grants. Requires extension/schema privileges. |
| `20261024000400_auth_profile_initialization` | Adds the `auth.users` insert trigger with idempotent profile/private initialization and safe existing-account backfill. Hosted Auth-table trigger privilege must be verified. |
| `20261025000100_user_profiles` | Explicit public-safe catalog/profile grants, owner RLS, private birth year, checked profile/experience functions. No email/private fields in public DTOs. |
| `20261025000200_events_api` | Creates NOLOGIN/NOBYPASSRLS event executor and postgres-owned argument-free subject resolver before executor functions/policies use it. No managed Auth grants. Requires role creation, temporary membership and function-owner changes. |
| `20261025000300_event_executor_identity` | Reuses the early resolver with CREATE OR REPLACE, retains policy checks and timestamp volatility corrections. Preserves ACL/owner requirements. |
| `20261025000400_event_attendance` | Narrow counter role, parent locks, transactional capacity and participant RLS; no blanket client DML. |
| `20261025000500_attendance_private_recheck` | Rechecks private visibility under the event lock. No new infrastructure dependencies. |
| `20261026000100_event_covers` | Private bucket upsert, restricted Storage policies, checked capabilities. Requires `extensions.digest(text,text)` **before this migration**, and `storage.allow_only_operation(text)`. Requires bucket/policy privileges without changing Storage owners. |
| `20261026000200_private_invitations` | Narrow executor, encrypted payload storage, committed attempts and checked attendance admission; no client secret tables. Application encryption key is provisioned separately. |
| `20261026000300_administrative_roles` | Narrow admin executor, current-role checks, shared serialization, immutable audit and operator bootstrap. Confirmation helpers are postgres-owned from their first definition; no managed Auth grants. |
| `20261026000400_admin_verified_identity` | Reasserts confirmed-account helpers, retains legacy column-grant cleanup, conditionally revokes legacy schema access only where delegation permits and rejects residual executor Auth-schema access. Bootstrap remains maintenance-only. |
| `20261026000500_event_moderation` | Narrow report/moderation executor, durable limiter, serialized cancellation and immutable audits. Preserves protected data and host boundaries. |
| `20261026000600_account_suspensions` | Included from updated `main`: confirmed active-account resolver, live-status RPC/Storage guards, private state and atomic audits, with runtime integration. The original 6A-1 disposable replay used SQL from `d29f46b`; hosted behavior remains unverified. |
| `20261026000700_staging_provisioning` | New additive operator-only RLS table recording environment, time and two one-way key fingerprints. No API/runtime grants or raw secrets; does not repair earlier prerequisites. |

Before applying historical SQL, run the read-only `supabase/staging/preflight.sql` as the
reviewed operator. Check `unaccent`, `pg_trgm`, and `pgcrypto` placement. The first two are
installed by migrations; `pgcrypto` is an existing platform assumption, not installed by this
history. If `extensions.digest(text,text)` is absent, stop: enabling the supported extension
in `extensions` is a separately approved prerequisite **before** the cover migration.
A late compatibility migration cannot repair an earlier failed GRANT. Never relocate an
existing extension automatically. An absent Storage operation helper likewise blocks rollout;
request platform support/compatibility review rather than removing its checks.

Hosted `postgres` is managed, not unrestricted superuser. Verify CREATE ROLE, temporary
executor membership, SET ROLE/function ownership, Auth trigger installation and Storage
policy/bucket privileges. Preserve NOLOGIN/NOINHERIT/NOBYPASSRLS, empty security-definer
search paths, and final membership revocations. Do not change `auth`/`storage` ownership or
grant executors broad Auth access. See [managed privileges](https://supabase.com/docs/guides/database/postgres/roles)
and [custom-role migration permissions](https://supabase.com/docs/guides/deployment/managing-environments).
The corrected event/admin migrations do not attempt to delegate managed Auth privileges.
Supabase documents that unsupported grants can warn and do nothing, leaving custom roles
unable to reach Auth; they need not fail immediately during DDL. The earlier helpers remove
that broken intermediate dependency. A later additive migration cannot make those earlier
definitions independently usable. [Supported Auth helper pattern](https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema).

Storage policy creation has a supported Supabase exception to ordinary table ownership:
`supautils.policy_grants` can allow `postgres` to manage policies on `storage.objects`.
An owner-membership check returning false is not proof of incompatibility. Inspect the
setting using the updated read-only preflight; it must authorize the actual migration role
for `storage.objects`. This does not authorize unrelated ALTER TABLE or ownership changes.
[Supautils policy support](https://github.com/supabase/supautils#manage-policies).

The cover migration also delegates Storage schema USAGE, SELECT(bucket_id,name,metadata),
and digest EXECUTE. Confirm grant options (or already-effective executor rights) separately;
SELECT/INSERT/UPDATE for postgres and the policy exception do not prove delegation rights.
Missing support is a hosted rollout blocker, not permission to grant managed owner roles,
weaken policies or invent a Storage bypass. No Storage migration/policy was changed here.

The supplied hosted `ensure_rls` evidence describes enable-only RLS on newly created public
tables, without FORCE, policies, grants or rejecting creation; this is compatible with our
explicit ENABLE statements. Leave it enabled. The apparent copied syntax fragment is not
evidence that the installed function is invalid. No trigger investigation/change is required
unless actual execution supplies contradictory evidence.

Do not reset the populated local database or replay these historical files over it. Its
already-applied final helper definitions are preserved by the corrected fresh sequence.
Existing local version history is not a new execution/checksum attestation. Keep an approved
Git revision/inventory of the old source; regenerate and review the new audit SHA-256 values
and a fresh linked dry-run before hosted approval. Never use migration repair to hide drift.

## Data API settings and security

Keep Data API enabled, automatic table exposure disabled, and automatic RLS enabled.
Expose `public` only, never `private` or `auth`. Preserve the existing supported `extensions`
search path. RollCall already explicitly grants approved geography/catalog reads and RPC
execution; automatic grants are unnecessary. Automatic RLS is compatible with explicit
`ENABLE ROW LEVEL SECURITY`; it must not install permissive policies. Verify effective
ACLs, not just Dashboard switches. See [explicit grants with table exposure disabled](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

Fastify continues using only the publishable/anon key plus each caller's verified bearer
token. Never configure service-role access or a runtime database password. Raw private
tables, roles, audit rows, addresses, invitations and provisioning fingerprints remain
unavailable to clients. During hosted acceptance, test expired/unconfirmed/suspended callers
directly against public RPCs and Storage, independently of Fastify's middleware.

## Exact 6A-2 rollout order (future authorization required)

1. Confirm the reviewed source includes full 5B-2B integration. Run typecheck/lint/build and relevant SQL tests;
   run `pnpm staging:prepare audit --target=staging`. Save the migration SHA-256 inventory
   privately and require `readyForRollout: true`. This is a source prerequisite check, not
   proof of hosted readiness. Verify Dashboard organization/name/reference and empty baseline.
2. Inspect hosted configuration/preflight metadata; resolve the prerequisites above. Review
   backup/recovery and explicitly approve the exact target and pending migration list.
3. Only then log in/link manually from the repository root, using placeholders below.
   Use CLI secure prompts/credential storage; never put passwords/tokens in command arguments,
   shell history, reports or screenshots. Linking is a future operator action, never automatic.

   ```powershell
   pnpm exec supabase login
   pnpm exec supabase link --project-ref "<STAGING_PROJECT_REF>"
   pnpm exec supabase migration list --linked
   pnpm exec supabase db push --linked --dry-run
   ```

   Verify the linked ref again. Stop on drift, unrelated migrations or unexpected objects.
   The preview lists pending files; it does not execute their SQL and cannot prove privileges.
4. After explicit approval of that preview, apply once and inspect history/preflight again:

   ```powershell
   pnpm exec supabase db push --linked
   pnpm exec supabase migration list --linked
   ```

   Do not add `--include-seed`, `--include-roles`, `--include-all`, migration repair or reset.
   Plain push applies migrations, not this application's development seed. See
   [migration workflow](https://supabase.com/docs/guides/deployment/database-migrations)
   and [CLI flags](https://supabase.com/docs/reference/cli/global-flags).
5. Prepare the separate operator configuration described below. Dry-run the catalog, then
   deliberately enable/apply it. Verify four enabled countries, eight essential games, and
   zero copied accounts/events/sample cities. Validate/import reviewed country archives.
6. Generate independent staging keys locally, back them up securely, provision their database
   verification material, and transfer raw keys only to the staging backend secret manager.
   Verify private Storage configuration and Auth settings below. No application deployment yet.
7. Register/confirm a deliberately selected temporary or intended staging account using the
   approved Auth flow. Bootstrap only its reviewed UUID through the gated operator action.
   Retain immutable audit evidence privately. Never promote the first account automatically.
8. Run the post-deployment acceptance checklist below. Record hosted versions, results/counts,
   failures and remaining 6B origin/hosting work. Set operator writes back to false and close
   the maintenance session. Do not open staging to testers until security checks pass.

## Isolated operator configuration and commands

Copy `backend/.env.staging-operator.example` to **ignored** `backend/.staging/operator.env`.
Populate it privately from the approved Dashboard Connect details. Do not edit backend or
frontend `.env`. Node loads this operator file only for `staging:prepare`.

| Operator variable | Purpose |
| --- | --- |
| `ROLLCALL_STAGING_PROJECT_NAME` | Must be `rollcall-dev`; human identity review is still required. |
| `ROLLCALL_STAGING_PROJECT_REF` | Approved 20-character reference, kept out of tracked files. |
| `ROLLCALL_STAGING_SUPABASE_URL` | Exact `https://<STAGING_PROJECT_REF>.supabase.co` origin. |
| `ROLLCALL_STAGING_DATABASE_URL` | Private maintenance connection with URL-encoded credentials; never Fastify/browser config. |
| `ROLLCALL_STAGING_DATABASE_CA_FILE` | Optional trusted CA file for the server certificate; never disable verification. |
| `ROLLCALL_STAGING_WRITES_ENABLED` | Defaults false; deliberately set true only during approved 6A-2 work. |

Allowed database targets: direct `db.<ref>.supabase.co:5432` with user `postgres`, or Dashboard
session pooler `aws-<number>-<region>.pooler.supabase.com:5432` with user `postgres.<ref>`.
Use database `postgres`, no query/fragment/SSL overrides. TLS certificate validation is always
enabled. Direct connections may require IPv6; use the approved session pooler if needed,
never transaction mode on 6543 because session locking is required.
[Connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres).

All actions require `--target=staging`; all default to dry-run, without a database connection.
Remote apply also requires complete source, the enabled flag, matching configured/CLI ref,
and exact action-specific confirmation. These guards prevent mistakes, not a malicious
operator relabeling production; independently verify the Dashboard identity first.

```powershell
pnpm staging:prepare catalog --target=staging
pnpm staging:prepare catalog --target=staging --project-ref="<STAGING_PROJECT_REF>" --apply --confirm="staging:<STAGING_PROJECT_REF>:catalog"
pnpm staging:prepare geography --target=staging --directory="<ARCHIVE_DIRECTORY>"
pnpm staging:prepare geography --target=staging --directory="<ARCHIVE_DIRECTORY>" --project-ref="<STAGING_PROJECT_REF>" --apply --confirm="staging:<STAGING_PROJECT_REF>:geography"
```

Directory paths are relative to `backend` because pnpm runs that package's script. On Windows
with blocked PowerShell shims use `pnpm.cmd`. Do not use debug modes that dump environment
variables. Diagnostics deliberately suppress raw database errors/URLs; investigate failures
through privately reviewed metadata and platform logs without copying credentials into reports.

## Reference data and GeoNames

Migrations already install ME/RS/BA/HR. The staging catalog adds only the eight essential
games with stable IDs 1–8, preserves existing records, advances the sequence without moving
it backward and refuses ID/name collisions. It is transactional and repeatable. It never
inserts cities, users, accounts or events. `supabase/seed.sql` remains development-only and
unchanged: it includes 13 sample cities and a non-idempotent game insert.

Use the four cached ME/RS/BA/HR ZIPs or extracted country TXT files matching
`docs/geographic-dataset-manifest.json`. The staging helper never downloads or refreshes.
It checks all four text SHA-256 values, ZIP hashes when ZIP is used, country/filter scope,
license and eligible counts **before connecting**. TXT takes precedence over ZIP; both cannot
silently substitute a newer source. Obtain updated data only through separate manifest review.
Retain GeoNames [CC BY 4.0 attribution](https://www.geonames.org/export/).

Validated source totals: ME 4,000; RS 9,489; BA 21,389; HR 11,363: **46,241 eligible places**.
The manifest's existing local catalog has 46,243 cities/23,401 aliases, including two retained
ambiguous sample cities. Fresh staging omits these sample cities; aliases may also differ
because seed adoption contributed local aliases. Reconcile per-country totals, imported source
IDs and alias counts, explaining differences rather than forcing the local snapshot totals.

The staging entry point reuses the unchanged parser/normalizer/parameterized importer and
its per-country transactions, import advisory lock, source-date checks, stable source identities,
bounded batches, aliases and no-delete behavior. All staging operators also share a session
advisory lock. Each country commits separately; retry with the same reviewed files after a
partial failure. Do not erase already committed countries. No HTTP/startup/build importer
exists. Existing `geography:import`, cover/invitation setup and local bootstrap guards remain
loopback-only; never repoint those commands to hosted configuration.

## Independent keys and administration

```powershell
pnpm staging:prepare keygen --target=staging
# Future, explicit local generation; never overwrites an existing key file:
pnpm staging:prepare keygen --target=staging --apply --confirm=GENERATE_STAGING_KEYS
pnpm staging:prepare provision-keys --target=staging
pnpm staging:prepare provision-keys --target=staging --project-ref="<STAGING_PROJECT_REF>" --apply --confirm="staging:<STAGING_PROJECT_REF>:provision-keys"
```

Generation writes two independent cryptographically random 32-byte base64url roots to ignored
`backend/.staging/server-secrets.env`; values are never printed. Restrict directory access
(Windows ACLs as well as POSIX file mode) and back up in the team's secret manager. No actual
staging roots were generated during 6A-1. Only temporary test roots were used locally.

Provisioning atomically stores the existing cover operation SHA-256 and a staging ledger with
cover/invitation fingerprints, not raw keys. Exact retries succeed; conflicting fingerprints
fail without rotating either key. The invitation fingerprint detects accidental root changes;
decryption still happens only in the backend, with existing RPC capability checks unchanged.
Losing/changing the invitation root invalidates decryptability of existing codes. Key rotation
and hosted superadmin recovery need separately approved procedures; never delete the ledger
or regenerate roots to work around a failure. Fastify gets raw roots through secure server
environment configuration, never through `VITE_*`, a database service-role key or logs.

Bootstrap is disabled by default, uses the same staging target gates and checks current
suspension state. The existing database function independently requires a confirmed account,
serializes against role writes, refuses any prior bootstrap/superadmin and audits atomically.
The legacy audit `source='local_operator'` denotes the trusted operator procedure; correlate
it with the private staging maintenance record, not an API actor. It is not a public endpoint.

```powershell
pnpm staging:prepare bootstrap --target=staging --user-id="<CONFIRMED_ACCOUNT_UUID>"
pnpm staging:prepare bootstrap --target=staging --user-id="<CONFIRMED_ACCOUNT_UUID>" --project-ref="<STAGING_PROJECT_REF>" --apply --confirm="staging:<STAGING_PROJECT_REF>:bootstrap"
```

## Auth and application environment preparation

Email/password registration and confirmation remain enabled; anonymous Auth sign-ins remain
disabled. Retain PKCE and existing session/cache invalidation. Hosted accounts are independent
UUID identities; never copy local Auth tables or equate them with numeric demo accounts.
Set a minimum password length of eight to match current UI validation (8–72 characters),
and review any stronger hosted requirements against that UI before enabling them.

Site URL is the **approved staging frontend origin**, still TBD in 6B. Allow only exact
`<APPROVED_STAGING_ORIGIN>/auth/callback` and `<APPROVED_STAGING_ORIGIN>/reset-password`.
For authorized pre-6B local-client staging smoke tests, explicitly allow the one chosen
loopback origin and those exact paths using a separate ignored staging configuration.
Do not change ordinary local `.env`, invent a hosted domain, use wildcard redirects or disable
confirmation. Verify templates respect the requested redirect and PKCE code exchange in the
same browser; recovery must reach the existing reset route. See
[redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

Default hosted email is restricted to organization team addresses and severe changing rate
limits (currently documented as two messages/hour). Configure reviewed custom SMTP for
general staging testers, sender/domain authentication and appropriate abuse limits; keep SMTP
credentials out of source and reports. Test actual delivery/confirmation/recovery, not just
accepted API requests. [Hosted SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp).

| Configuration location | Variables and handling |
| --- | --- |
| Ordinary local frontend/backend | Existing `.env` files unchanged, local project and independent local keys. |
| Staging frontend build | Public `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_ORIGIN`, `VITE_ENABLE_DEMO_MODE=false`. Publishable is intentionally public; never privileged keys. |
| Staging backend | `NODE_ENV=production`, platform-approved `HOST`/`PORT`, `LOG_LEVEL=info`, hosted `SUPABASE_URL` and unprivileged `SUPABASE_PUBLISHABLE_KEY`, secret `EVENT_INVITATION_KEY` and `EVENT_COVER_OPERATION_KEY`. |
| Backend optional controls | Existing defaults: `SUPABASE_TIMEOUT_MS=5000`, `CITY_SEARCH_DEFAULT_LIMIT=4`, `CITY_SEARCH_MAX_LIMIT=20`; validated limits remain unchanged. |
| Operator workstation | Only ignored `backend/.staging/operator.env`, keys/CA/secure backups. Database credential never enters app hosting/browser config. |

`API_PROXY_TARGET` is Vite development-server configuration, not a deployed browser variable.
Fastify currently has no cross-origin browser CORS policy. In 6B prefer a reviewed same-origin
`/api` reverse proxy (empty `VITE_API_ORIGIN`) or implement/review exact-origin CORS before
choosing a separate API origin. Hosting TLS/proxy/port settings remain 6B work, not implemented
deployment. Never set demo opt-in for the staging production build.

## Storage setup and acceptance checklist for 6A-2

The cover migration configures `event-covers` through the supported bucket configuration;
keep it private, maximum 3,145,728 bytes, JPEG/PNG/WebP only. Confirm hosted project-wide
upload limits permit the bucket's ceiling. Do not change Storage-owned table owners, expose
the bucket, forge `storage.objects` rows or upload fixtures by SQL. Use supported Storage
HTTP operations, the existing backend reserved paths and operation capability. Operation
helper/version compatibility is a prerequisite, not permission to drop policies.
[Storage access policies](https://supabase.com/docs/guides/storage/security/access-control).

Use a few newly registered, confirmed staging fixtures, explicitly approved for testing.
Do not run existing local-only SQL/Auth fixture runners against remote URLs or relax their
guards. The following are **pending hosted acceptance checks**, not completed 6A-1 tests:

- Compare reviewed migration inventory/history, functions/owners, executor flags and final
  memberships, effective ACLs/RLS and Data API schema exposure. Run preflight again.
  Anonymous raw event/private/provisioning reads and unauthorized role/bootstrap RPCs fail.
- Verify four countries/eight essential games, per-country imported source counts, uniqueness
  of `(external_source, external_source_id)`, alias search and city ID lookup. Rerunning
  catalog/import preserves IDs, associations and legitimate edits; record actual aliases.
- Register, confirm, log in/out, recover password, refresh sessions and edit profile/experience.
  Registration initializes exactly one public profile. The optional private-age row may remain
  absent until age information is saved; that is not an initialization failure. Public responses
  omit email/age/roles. Missing role assignment means ordinary user, not a missing profile.
- Create/edit events, join/leave, duplicate/full-event rejection and concurrent last-slot admission;
  only host/members receive exact addresses/private details. Test private code issue/rotation/
  revocation/expiry and durable rate limits. No stale code admits after event state changes.
- Host upload/replace/remove real cover files through the backend; reject wrong host, oversized/
  unsupported files, arbitrary paths, forged ownership, cross-event deletion and direct signing.
  Public covers follow the intended policy; private outsiders fail. New signed URLs last 60s;
  test expiration. Previously issued URLs retain a residual window up to 60s after access loss.
- Bootstrap only the chosen confirmed account; verify audited admin transitions and denial of
  self/superadmin changes. Test report cancellation/dismissal and immutable audit protections.
- Suspend a fixture and test existing JWTs through Fastify **and directly through Data API
  profile/event/invitation/cover RPCs and Storage**; protected access must fail. Reinstate and
  verify appropriate access resumes, without reactivating moderated events or granting roles.
- Remove temporary fixtures through supported application/approved maintenance operations;
  preserve immutable audit evidence. Record results without tokens, codes, keys or personal data.

If any authorization/RLS/audit/concurrency check fails, stop rollout. Do not enable broader
grants, service-role runtime access or permissive policies to obtain a passing smoke test.

## Recovery limits

**Subsequent registration changes:** the operator reports migration 17,
`20261027000100_registration_identity.sql`, now applied locally and hosted. The original
16 migrations remain the historical staging preparation baseline. Case-preserving
usernames require separately reviewed forward migration 18, tested on disposable local
Supabase only; follow the [database/backend/frontend order](auth-experience.md).
Do not replay historical files or treat this code change as completed hosted acceptance.
Use [dedicated application configuration](registration.md) for local smoke testing;
it does not read operator configuration or perform migrations/bootstrap.

Migrations apply sequentially, each existing file uses its transaction boundary. Stop on an
error and inspect actual history/state; a successful earlier migration remains applied.
Never mark a failed migration applied, erase history, reset hosted staging, or run destructive
down SQL as routine recovery. Use a reviewed forward migration or a separately authorized
restore/recreation after confirming data/backups. Database backups do not substitute for
physical Storage object backups or invitation-root backups. Catalog conflicts require human
review; country imports retry additively from reviewed sources. Recovery of lost secrets,
bootstrap state or hosted ownership incompatibilities is separately reviewed operator work.
