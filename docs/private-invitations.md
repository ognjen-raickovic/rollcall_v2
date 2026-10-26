# Milestone 5A: private invitations and verification

Implemented locally on `feat/private-event-codes`, without subagents, hosted changes,
database resets/imports, admin permissions, commits or deployment.

## Setup and API

Apply pending local migrations, run `pnpm covers:setup` and `pnpm invitations:setup`, then
restart Fastify. The new setup generates a 32-byte base64url `EVENT_INVITATION_KEY` in
ignored `backend/.env`, without printing or silently rotating it. Keep a secure backup:
losing/replacing it prevents old-code recovery/verification; hosts must regenerate codes.

| Endpoint | Access and result |
| --- | --- |
| `GET /api/events/:id/invitation` | Host only; initializes on first deliberate reveal, then recovers `{code,expiresAt,revokedAt}` |
| `POST /api/events/:id/invitation/rotate` | Host only, empty body; replaces the code |
| `POST /api/events/:id/invitation/revoke` | Host only, empty body; blocks future joins |
| `POST /api/private-events/join` | Verified account; strict `{code}` body; returns only `{eventId}` |

Management responses are no-store; inactive codes have `code:null`. GET initialization is
intentional/idempotent and occurs on host reveal, never ordinary event reads. No event DTO
or PATCH includes code material. Participants cannot retrieve/manage codes.

## Security and lifecycle

Codes have 16 uniform characters (80 bits), grouped four-by-four, using
`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`. ASCII lowercase, spaces and hyphens normalize; other
characters fail. Node crypto random bytes generate codes. A unique keyed hash constraint
and bounded collision retries prevent ambiguity. HKDF derives separate HMAC-SHA256 and
AES-256-GCM keys; random 96-bit IVs and event-bound authenticated data protect recoverable
codes. PostgreSQL stores only keyed hashes and ciphertext, never plaintext or encryption keys.

Expiry is seven days or event start at issuance, whichever comes first. Redemption also
rechecks actual event time/status/visibility. Rotation/expiry/revocation retain existing
members. Leaving private visibility or cancellation revokes the code; returning to private
requires regeneration. Deletion cascades invitations. Public/unlisted admission is rejected.

The additive migration creates private invitation/attempt tables with RLS and explicit ACLs.
A dedicated NOLOGIN/NOBYPASSRLS executor uses the existing membership/counter infrastructure,
without address access or client role membership. Checked invoker wrappers require verified
UUID plus the existing server operation capability; direct PostgREST cannot verify guesses
without it. No service-role client is introduced.

Redemption commits a per-account limiter before lookup: 20 attempts per fixed 15-minute
window, including successes. Invalid/limited outcomes return SQL data rather than exceptions,
so counters do not roll back. Fastify adds 30 requests/minute per actual connection IP;
trustProxy stays false, spoofed forwarded headers do not change IP, and the map is bounded.
429 responses provide safe feedback/Retry-After. IP enforcement is process-local: production
multi-instance/proxy deployment requires shared IP enforcement and reviewed proxy trust.
Account enforcement remains shared/durable across restarts and instances.

Admission resolves the keyed hash, locks the event, then re-reads code state. Rotation,
revocation, edits/deletion and attendance use that parent lock. Scheduled future private
events admit non-hosts within capacity; repeats are idempotent. Existing attendance triggers
alone update counters. Unsuccessful attempts return generic errors without private identity.

## UI and verification

Private hosts get deliberate Reveal/Hide, Copy, Regenerate/Revoke, expiry/status and native
confirmation dialogs. Warnings explain that successful recipients gain exact-address access.
Discovery has a keyboard-accessible native code modal; anonymous login uses only a nonsecret
resume flag. Success clears input, invalidates viewer details/covers and navigates to the UUID.
Leave revokes membership-specific access. Existing signed covers retain their 60-second window.
Codes stay in controller memory/no-store responses, not query caches, URLs, storage or logs.
Session checks, cancellation and viewer-keyed route remounts protect account changes.

Executed: 40 backend unit tests; SQL lint; 353 SQL assertions. Real local invitation tests
pass seven entries covering ownership/encryption, repeated admission, expiry/revocation,
visibility/cancellation/deletion, direct-RPC denial and both limiters. Genuine final-seat
competition cannot overbook. Rotation and revocation tests observe two actual PostgreSQL lock
waiters before release, then prove obsolete-code denial. The observer clears its statistics
snapshot. Existing real attendance and Storage modules passed seven and six entries.

Two browser journeys passed at 375px dark and 1440px light: reveal/refresh recovery, copy
handler (clipboard stub, leaving OS clipboard untouched), rotation, keyboard/wrong-code
feedback, persisted membership, authorized address/custom cover and leave. Traces/failure
screenshots are disabled; cleanup clears secret-bearing DOM. Review screenshots hide codes.
Both journeys also verify Escape/focus restoration and host logout/account switching: the
revealed code, protected address and signed cover are absent for the replacement outsider.
Other viewport/theme combinations and unrelated browser suites were intentionally not repeated.

Reproduce with `RUN_LOCAL_INTEGRATION=true` and backend `tests/integration/invitations.test.ts`;
use `RUN_LOCAL_INVITATIONS_UI=true` with frontend `tests/invitations-ui.spec.mjs`, selecting
`--project=375-dark --project=1440-light`. Fixtures refuse remote services and remove only
their own records/files. Frontend/backend workspace typecheck, lint and build passed.
Visual inspection passed for both representative layouts. Final cleanup preserved 46,243
cities, 23,401 city aliases and eight games; all synthetic accounts, events, memberships,
invitations, attempt counters and cover objects were removed. Ignored environment/runtime
files remain excluded, and neither local invitation nor operation secrets appear in
commit-eligible files. Milestone 5A is ready for PR review, subject to the deployment limits below.

Limits: first host reveal lazily initializes codes; no auto-issuance during event creation.
Production key provisioning/rotation and shared IP limits need coordinated rollout. Revoking
a code is not participant removal. Administrative roles are deferred to 5B.

## Milestone 5B-2B

5B-2B guards invitation management/redemption and Storage/event subject resolution against suspended callers, including old JWTs and direct RPCs. Suspension alone does not revoke codes or remove memberships; it blocks the suspended actor. Reinstatement restores normal scoped permissions. See [account suspension](account-suspensions.md).
