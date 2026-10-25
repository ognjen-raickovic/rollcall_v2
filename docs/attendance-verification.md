# Milestone 4B attendance verification

Verified locally on 25 October 2026 on `feat/event-attendance`. The existing local Supabase
database/Auth/mail stack was reused. No branch changes, staging, commits, pushes, merges,
deployments, remote Supabase operations, database resets or geographic imports were performed.
Credentials and access tokens were not printed in diagnostics.

## Delivered behavior and files

Authenticated POST/DELETE `/api/events/:eventId/attendees/me` persist the verified account's
own membership. Both return 200 `{eventId,hasJoined,capacity,participantCount,availableSlots}`.
Requests accept no body or `{}`, no query fields, and no submitted user/actor IDs. UUID
accounts remain separate from numeric frontend demos. See [contracts](events-api.md).

Backend changes are in the existing events module's routes, schemas, types and repository,
plus two narrow RPC database types. New `backend/tests/attendance.test.ts` covers auth,
strict payload/query/UUID validation, response/count consistency, sanitized conflicts and
public/host/participant projection. Existing event unit/live tests were adapted for viewer
fields and legitimate participant access. New `backend/tests/integration/attendance.test.ts`
uses a real loopback HTTP listener, actual local Auth/PostgREST/PostgreSQL and independent
PostgreSQL connections for lock-contention tests. No app registration, package, lockfile,
environment or frontend runtime changes were required.

Two additive migrations were actually applied locally:

- `20261025000400_event_attendance.sql` adds checked join/leave wrappers, owner membership
  RLS, participant-aware details and narrowly scoped trigger ownership. It reuses the existing
  membership table/key/counter/invariant bodies; it creates no second attendance system.
- `20261025000500_attendance_private_recheck.sql` rechecks private membership immediately
  after acquiring the event lock, preventing stale authorization after a concurrent leave.

New `supabase/tests/database/attendance.test.sql` adds 59 assertions. Two existing 4A
assertions were updated for the intentionally added executor membership privileges. Root/
backend/frontend instructions, README, SPEC, entity contracts, event API, schema, architecture
and roadmap documentation now distinguish backend attendance from the unchanged React mocks.

## Transaction and authorization model

The backend verifies Supabase Auth and creates a request-local unprivileged client. SQL
derives the actor through the existing argument-free subject resolver, never a supplied ID.
The checked function locks the event row, rechecks current private membership and actual
time/state, excludes the host, and then modifies only its own membership. Unique event/profile
keys, foreign keys and existing triggers maintain exact counters. Capacity edits/deletion
serialize on the same row. Errors roll back the membership and counter together.

Public/unlisted future scheduled events allow joining. Existing members can repeat join
even if full; accessible nonmember leaves are no-ops. No-op timestamps/counts remain unchanged.
Timing/status and host rules apply before no-op handling. Private outsiders cannot join or
probe details/state through attendance. Existing private members may repeat join or leave;
after leaving, subsequent detail/join/leave requests return the same 404 as a missing event.
No admin override, private admission, room code or age/experience eligibility check was added.

The event executor remains NOLOGIN/NOBYPASSRLS. Owner-only membership policies avoid RLS
cycles. A lock-only UPDATE policy with false WITH CHECK permits row locking while the
original host check remains the only content-write authorization. A separate non-login,
non-bypass `rollcall_attendance_counter` owns the existing trigger helpers and can update only
the count column, read required event columns and read location IDs. It cannot read address
text, edit event content or modify memberships. Trigger ACLs/search paths are hardened;
API roles cannot assume either role or directly access membership/event/location tables.
RLS stays enabled and no service-role runtime path was introduced.

All details include `{viewer:{userId,isHost,hasJoined}}`. Only verified hosts/current members
receive addresses; the repository checks viewer/caller identity and projects an explicit safe
DTO. Public discovery remains viewer-independent. Email, private profile age, roles, other
participant identities and invitation secrets are absent. Details/mutations are no-store and
vary on Authorization. Private leave returns an address-free summary even as read access ends.

## Executed checks

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Frontend/backend passed, including backend test types |
| `pnpm lint` | Both passed; frontend feature boundaries passed |
| `pnpm build` | Both production builds passed |
| `pnpm test:backend` | All 34 tests passed, including four new attendance/DTO tests |
| Focused live attendance integration | Six scenarios plus parent passed (seven Node entries) |
| Existing live event lifecycle integration | Four scenarios plus parent passed (five entries) |
| Existing live Auth/profile/geography integrations | Four tests passed, including imported-place search |
| `pnpm db:lint` | Clean, with no schema warnings/errors |
| `pnpm db:test` | All 276 assertions passed across six files, including 59 new attendance assertions |
| `pnpm db:test:concurrency` | Both existing trigger-level final-seat/capacity races passed |
| `pnpm test:mock` | Eleven scenarios plus parent passed (12 entries) |
| `pnpm test:geography` | Five client scenarios plus parent passed (six entries) |
| `pnpm test:profiles` | Two client scenarios plus parent passed (three entries) |
| `git diff --check` | Passed |

The live suite verifies HTTP join/leave persistence and a fresh Fastify instance reading the
saved membership; count/actual-row equality; no-op timestamp preservation across HTTP
transactions; participant-only address access; unlisted participation; private access loss;
anonymous/invalid/forged/host/full/past/cancelled restrictions; safe host visibility changes;
direct Data API table denials; and verified RPC identity with no submitted-actor overload.

Six deterministic races use separate concurrent PostgreSQL transactions executing the actual
RPCs under authenticated caller context. The first transaction retains its event lock while
the second begins its operation. The test polls `pg_stat_activity` and requires the second
connection to be blocked on a Lock before releasing the first. These checks are not mocked
repository calls or sequential Promise assertions:

| Contention scenario | Observed result |
| --- | --- |
| Two different users claim one final seat | First succeeds; second returns full conflict; one membership |
| Same user concurrently joins twice | Both succeed idempotently; one membership/seat |
| Existing member leaves while another user joins | Leave commits, waiting join succeeds; count matches the replacement membership |
| Two requests leave the same private membership | First succeeds; blocked second returns concealed not-found; count zero and access revoked |
| Join fills the event while host lowers capacity | Waiting capacity edit conflicts; both seats remain and capacity is preserved |
| Join waits until after the start time | Post-lock actual-time check rejects it; no membership/counter change |

Additional concurrent real HTTP batches verify that three different users joining two seats
produce exactly two successes and one full conflict, four duplicate joins consume one seat,
and four repeated public leaves return success while keeping count zero. Independent SQL
assertions prove non-host executor content updates and cross-actor membership writes remain
denied, alongside role flags, column grants, wrapper ownership, ACLs and private-address rules.
A separate read-only security review found no remaining static blocker; live results above
were executed and reviewed by the primary agent.

Fixtures clean up only generated accounts/events; SQL tests roll back. Final aggregates match
the pre-work baseline: 46,243 cities, 23,401 aliases, eight games; zero Auth users, profiles,
events, locations or memberships. Both attendance migration versions are recorded as applied.
The existing stack was left running; test HTTP listeners and PostgreSQL connections closed.

## Limits and Milestone 4C requirements

Milestone 4B is ready for PR review based on local verification. Hosted migrations/deployment,
production load/abuse testing and large-volume query benchmarks were not performed. Reads
use normal PostgreSQL snapshots; already delivered addresses cannot be recalled, and an
in-flight read may finish while another request leaves. Subsequent requests enforce current
committed membership. Attendance responses are snapshots and may be superseded by another
committed mutation. Hard event deletion still has no archive/audit workflow.

React event CRUD/attendance still uses numeric mocks and explicit development-only demo
actors; UUID accounts do not inherit demo permissions. No UI/browser suites were run because
frontend runtime/styles/routes were unchanged; relevant client/mock regressions and static
checks/build passed. No private outsider admission, participant lists, administrative removal,
experience/age enforcement, Storage or upload integration is included.

Milestone 4C must deliberately replace feature API adapters with the real UUID event/detail/
attendance contracts, preserve pagination/filter semantics, isolate viewer-specific cache keys
by verified account, clear caches on account changes, and refetch/invalidate details/discovery
after join/leave or host edits. Use viewer flags for actions and handle 401/404/409, including
private leave losing read access. Keep UUID accounts separate from numeric demos, preserve
geography and themes, and do not pretend mock custom images were uploaded. Storage is 4D;
private admission codes and separately reviewed role authorization remain Milestone 5.
