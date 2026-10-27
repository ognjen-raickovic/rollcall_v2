# Account deletion: proposal for separate approval

**Design only. No deletion endpoint, worker, migration or enabled UI action exists.**
The account Danger Zone is informational. Do not perform deletion with the current
ordinary host/profile APIs or weaken RLS to make it possible.

## Existing constraints inspected

- `auth.users -> profiles` cascades; private DOB, roles, experience, suspension state
  and attempt counters cascade from profiles. Registration reservations have an email
  hash and temporary DOB but no profile FK; those need explicit cleanup too.
- `events.host_id` and `event_participants.profile_id` restrict profile deletion.
  Host identity is immutable. There is no safe existing host-transfer workflow.
  Event deletion cascades locations, participants and invitations. Participation
  deletion invokes counters/triggers; bulk cleanup must preserve their invariants.
- Report live event/reporter FKs use SET NULL; target UUID snapshots remain. Role,
  moderation and suspension audits deliberately retain UUID snapshots without live
  account FKs and reject update/delete/truncate. User-authored explanations may contain
  personal information; immutability does not itself establish a lawful retention policy.
- The cover manifest records event/host UUIDs and lifecycle state without cascading
  away the cleanup evidence. The private Storage bucket uses checked exact-path RLS.
  File deletion must use the Storage API, not SQL against Storage metadata.
- Live SQL authorization checks confirmed Auth existence plus a profile and current
  suspension state. They block protected operations after actual account removal,
  but there is no deletion-in-progress gate or durable deletion job today.
- The runtime is unprivileged. Supabase's Auth Admin delete requires privileged
  server credentials; Storage-owned objects can prevent Auth deletion. Existing
  JWTs are not retroactively expired by deleting the account. These are provider
  constraints, not tested new capabilities. Sources: [Auth Admin deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser),
  [user management](https://supabase.com/docs/guides/auth/managing-user-data),
  [session validation](https://supabase.com/docs/guides/auth/sessions).

## Proposed workflow

1. **Identify and reauthenticate.** An owner-only, bearer-authenticated challenge
   derives the UUID exclusively from verified Auth. Accept no target account ID,
   role or email as ownership proof. Require fresh password/provider authentication
   in addition to an explicit irreversible confirmation. Passwords remain in the
   provider Auth flow, not RollCall request logs or deletion jobs. A refreshed JWT's
   `iat` or a client timestamp is insufficient evidence of recent authentication.
   The isolated verifier must match the verified `session_id` to a live Auth session
   and validate recent provider authentication evidence (for example password AMR
   plus session creation within five minutes). Verify supported provider semantics
   and replay tests before implementation; fail closed if evidence is unavailable.
   Bind a hashed one-use challenge to subject/session, purpose and short expiry.
   Require fresh confirmation when it expires. Rate-limit durably; protect allowed
   origins and never treat CORS or possession of a target UUID as authorization.
2. **Reject critical roles.** Initial policy: no self-service deletion of any
   superadmin. A separately approved recovery/role-transfer procedure must establish
   an independently confirmed active replacement first. Never automatically demote,
   delete the last superadmin or expose a bootstrap shortcut. Recheck current role
   under the existing role lock; a concurrent promotion must invalidate the request.
   Decide suspended-account privacy requests separately: do not require reinstating
   application access merely to request erasure. The worker needs a distinct narrow
   identity/cleanup authority, not relaxed suspension checks on ordinary operations.
3. **Freeze and inventory atomically.** Proposed identity-only request and status
   endpoints (`POST /api/me/deletion-request`, `GET /api/me/deletion-status`) accept
   the challenge, never an actor UUID. Under role -> account -> event/report lock
   ordering, validate reauthentication/eligibility, consume the challenge, insert
   an idempotent private job and a deletion tombstone, and snapshot exact object
   associations. Every protected RPC, raw-table RLS and Storage path must check the
   tombstone before more work is accepted; a Fastify-only check is insufficient.
   A concurrent join/upload/role change either commits before this inventory or
   observes the freeze. Keep self-status/recovery safe; never clear a suspension.
4. **Resolve hosted events.** Proposed destructive policy, requiring product approval:
   cancel scheduled hosted events, then remove all events owned by this account
   after cover cleanup; this removes their memberships, invitations and exact
   locations. Preserve audit snapshots and moderation decisions. Do not silently
   transfer an event to another player. Remove the departing account's memberships
   from other events with parent-first locks and current counter triggers. Existing
   profile RESTRICT FKs must not be dropped as a shortcut. Until this policy and
   concurrency tests are approved, accounts with hosted events are a deletion blocker.
5. **Clean Storage first.** Durable work items contain only exact reserved/associated
   object paths for the account and its hosted events, including pending/retired
   uploads. Enumerate actual provider ownership too; relying on active covers alone
   can leave objects that block Auth deletion. The freeze prevents new reservations
   or commits. Detach associations through reviewed cleanup transactions and remove
   bytes using supported Storage operations. A retry treats an already-missing object
   as success but never broadens a prefix or accepts a caller path. Keep manifests/
   inventory until absence is verified; no SQL deletion from `storage.objects`.
   Unexpected bucket ownership is a review blocker; never delete unrelated bucket
   contents just to make Auth deletion succeed.
6. **Erase private and public account data.** After object cleanup is verified,
   transactionally remove memberships/owned-event dependencies and then invoke Auth
   Admin deletion as the final irreversible provider step. Confirm that its cascade
   removes profile, username, biography/location, game experience, DOB/private age,
   role assignment and current-state/attempt rows. Remove outstanding registration
   reservations matching the account's email hash before discarding that identity
   mapping; do not store raw email/DOB in jobs. Username reuse is a product decision;
   proposed default is release after successful deletion, not a PII-bearing tombstone.
   Delete invitation records only for removed hosted events and the departing account's
   own attempt counters; preserve unrelated invitations and shared encryption/capability
   roots. Account deletion must never rotate or remove global runtime keys.
7. **Retain only approved evidence.** Keep append-only audit UUIDs, event/report UUID
   snapshots, security transition facts and minimal job stage/timestamps under an
   explicit retention/access policy. UUID pseudonyms are not guaranteed anonymous.
   Reports remain for moderation with live reporter FK null; sanitizing report text
   or audit explanations needs a reviewed policy and workflow. Never disable immutable
   triggers to perform ad hoc redaction. Privacy/legal retention and backup-expiry
   decisions are approval blockers, not assumptions settled by this proposal.
8. **Invalidate access and verify.** Revoke provider sessions/refresh tokens through
   the privileged worker, clear frontend viewer-scoped caches and sign out locally.
   Provider deletion alone does not invalidate previously issued JWT signatures.
   The durable freeze and existing missing-Auth/profile guards must independently
   reject old bearer tokens through Fastify, Data API and Storage. Add explicit live
   session validation where required. Already issued cover URLs retain their documented
   residual window up to 60 seconds. Public anonymous reads must no longer return
   the erased profile; do not claim backup bytes are instantly erased.

## Isolation and failure handling

Keep the main Fastify/Vite runtimes unprivileged. They can request only a checked
owner-bound job. A separate private worker, with no public administrative HTTP endpoint,
claims that job and independently rechecks subject, challenge, role and current stage.
Only this worker may hold the provider Auth Admin credential in its own secret manager;
that credential has broad privileges and must not be described as technically Auth-only.
Use separately reviewed narrow database cleanup functions/roles and exact-path Storage
operations. Restrict worker deployment, network access, logs and operators; never pass
the privileged credential through queue payloads, browser configuration or the main API.

This is a durable state machine across PostgreSQL, Auth and Storage, not a distributed
transaction. Suggested stages: requested/frozen -> inventory -> objects removed ->
dependencies removed -> Auth deleted -> verified. Claim once under job locks, checkpoint
idempotently, bound retries and route terminal failures to operator review. After a
destructive stage, keep the account blocked until completion; do not auto-unfreeze or
recreate missing data. A crash after Auth deletion must be recognizable by provider
absence plus the retained job, not retried as a different account. Store no credentials,
reauthentication passwords, DOB or raw email in diagnostics or immutable audit records.

## Separate implementation plan and acceptance gates

1. Approve hosted-event removal, username reuse, retention/redaction and superadmin recovery policy.
2. Design additive job/challenge/tombstone schema, explicit grants/RLS, narrow worker
   capabilities and lock ordering. Extend live guards without weakening suspensions.
3. Implement independently verified recent reauthentication, replay-safe owner requests
   and rate limits; test cross-user, expired/refreshed/replayed proof and role races.
4. Implement exact-object inventory/cleanup and dependency removal with durable retries;
   test upload/join/cancellation races, missing objects, partial failures and crashes.
5. Isolate Auth Admin deletion/session revocation and verify cascades, old-JWT denial,
   audit preservation, public erasure and backup-retention disclosures.
6. Only after review, add a clearly irreversible Danger Zone confirmation and job status UI.

No destructive part is authorized or implemented by the account experience redesign.
