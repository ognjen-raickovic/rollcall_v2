# Event comments and reviews

Forward migration **25**, `20261031000100_event_discussions.sql`, follows migration 24.
Implementation is local; this does not authorize hosted migrations, deployment or accounts.

## Lifecycle and permissions

| Actor | Read | Comment/reply | Review | Hide comments | Hide reviews |
| --- | --- | --- | --- | --- | --- |
| Guest | Public/unlisted by explicit UUID | No | No | No | No |
| Active user | Public/unlisted; private only as host/current member | Before end, including during event | After end, recorded participant other than host | No | No |
| Active host | Same visibility boundary | Ordinary author rules | Not own event | Own event | No |
| Active admin/superadmin | Same visibility boundary; no private override | Ordinary author rules | Ordinary reviewer rules | Accessible events | Accessible events |
| Suspended | Protected RPCs reject old JWTs; anonymous public browsing stays available | No | No | No | No |

An authoritative `clock_timestamp()` snapshot is taken after acquiring the event row
lock. Comments/replies and author comment edits close at `ends_at`; reviews and author
review edits require `now >= ends_at`. Cancelled events accept neither creation nor
author edits. Existing contributions remain readable. Active authors may soft-delete
their own content at any lifecycle stage; authorized moderators may hide at any stage.
Hidden/deleted contributions cannot be edited or receive replies.

Review eligibility uses the existing `event_participants` row, **not verified physical
attendance**. No check-in mechanism is added. A unique event/author constraint and event
lock prevent duplicates. Deleting a review clears text/rating. Creating again restores
the same row and updates editedAt; moderated reviews cannot be resurrected. No rating
aggregate is added. Replies are one level deep and must belong to the same event.

## Storage and security

Private RLS tables: `event_comments` (UUID, stable sequence, event/nullable author/nullable
parent, body, deleted/hidden flags, created/edited timestamps); `event_reviews` (same,
without parent, with integer rating and unique event/author); `discussion_attempts`
(one counter/window per account); `discussion_audit` (actor/target/event UUID snapshots,
authority, action, reason, server timestamp; no bodies).

The NOLOGIN/NOINHERIT/NOBYPASSRLS `rollcall_discussion_executor` has least-privilege grants.
All client/service-role raw-table/sequence access is revoked. The checked invoker RPC
`public.event_discussion(uuid,text,text,jsonb)` derives identity from the existing
confirmed active-account guard. It accepts no caller identity/role/timestamp/hidden flag.
The executor reads only safe event columns, membership references and public author names;
it uses the existing checked `my_permissions()` helper. No private age, email, addresses,
invitation secrets or raw roles are exposed. `UPDATE(id)` is necessary for event row
locking, but the executor's RLS write check is false: actual updates are denied.
Temporary migration memberships are revoked; existing policies/Storage stay unchanged.

Lock order is existing role/account shared locks, per-account attempt row, event row,
child rows. Cancellation, visibility changes, deletion and attendance serialize on the
same parent event. Live role/suspension transitions coordinate with existing locks.
Every SQL operation rechecks access. Private outsiders, including admins, receive the
same 404 as a missing event. Direct PostgREST cannot bypass these checks.

All well-formed write attempts share **30 changes/account/15 minutes**, across events,
kinds and operations. Invalid input/anonymous calls fail before accounting. Closed,
inaccessible, duplicate and forbidden outcomes return checked envelopes so attempt
counters commit despite HTTP errors. Limits return 429 and `Retry-After: 900`. The
counter stores no text/IP/email and is bounded to one row/account. Network/many-account
abuse protection remains a hosting responsibility; no CAPTCHA/classifier is added.

Bodies are plain text up to 2,000 characters (required for comments, optional for reviews).
Ratings are integers 1–5; control characters are rejected in API/SQL. React escapes text;
there is no HTML/Markdown or clickable linkification. Reasons are 5–500 characters.
Deleted bodies/ratings are cleared. Hidden bodies remain private for retention and
are never DTOs, even for author/moderator. Placeholders preserve thread structure.

Hiding and audit insertion commit atomically. Existing immutable-audit triggers prevent
UPDATE/DELETE/TRUNCATE; no generic client audit writer/list endpoint exists. Event
deletion cascades content; audit snapshots survive. Author deletion sets nullable FKs
to null (Deleted account label); attempts cascade. Account deletion remains disabled
under existing policy. This feature adds no retention/erasure worker or deletion period.

## HTTP contracts

Paths below are relative to `/api/events/:eventId`. GET optionally accepts a verified
token; writes require one. All responses use no-store and Vary Authorization.

| Method/path | Input | Result |
| --- | --- | --- |
| GET `/comments`, `/reviews` | `?limit=1..20&cursor=<decimal>` | Page |
| GET `/comments/:id/replies` | Same pagination | Reply page |
| POST `/comments`, `/comments/:id/replies` | `{body}` | Acknowledgement |
| PATCH `/comments/:id` | `{body}` | Acknowledgement |
| DELETE `/comments/:id`, `/reviews/:id` | No body | Acknowledgement |
| POST `/reviews`, PATCH `/reviews/:id` | `{rating,body?}` (complete replacement) | Acknowledgement |
| POST `/comments/:id/hide`, `/reviews/:id/hide` | `{reason}` | Acknowledgement |

Acknowledgement: `{eventId,viewerId,id}`. Page:
`{eventId,viewerId,kind,items,nextCursor,permissions}`. Stable ascending identity cursors
bound root/review pages to 20; replies load separately on expansion with the same bound.
Authors expose only UUID/displayName. Items contain id, author, body/null, timestamps,
deleted/hidden, canEdit/canDelete. Comments add parentId/null, isHost and replyCount;
reviews add rating/null. Permissions include commentsOpen/reviewsOpen, canComment/
canReview/moderation flags, cancelled, checked serverTime and endsAt.

Errors: 400 invalid input; 401 missing/invalid identity; 403 ineligible/unauthorized or
ACCOUNT_SUSPENDED; 404 missing/inaccessible; 409 closed lifecycle/hidden state/duplicate;
429 limits; sanitized 503 dependencies. API/client validation rejects viewer/target
mismatch and any hidden/deleted body. No service-role client is used.

## Frontend and administration

Real EventDetails uses Radix keyboard-accessible tabs, defaulting to details on entry/
reload. Full pages/previews share implementation; numeric demos are unchanged. Native
modal dialogs provide compositing/edit/delete/reasoned moderation. The existing admin
report page points to accessible event tabs; there is no duplicate dashboard or private
event directory. Hosts cannot hide unfavorable reviews or erase moderation history.

Queries nest under the existing protected event-detail/viewer key. Auth/recovery,
suspension, membership and account-switch cleanup destroys them. Reads consume abort
signals; writes recheck the initiating session before adopting acknowledgements. No
optimistic content is shown. Mutations revalidate and retain no unobserved state;
drafts live in component memory and disappear on viewer changes. Active lists refresh
every 30 seconds; SQL always decides eligibility even if a stale button remains visible.

## Verification and manual rollout

```powershell
pnpm.cmd test:discussions
pnpm.cmd --filter backend exec tsx --test tests/discussions.test.ts
$env:PLAYWRIGHT_CHANNEL='chrome'
pnpm.cmd --filter frontend test:discussions-ui
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build
```

SQL assertions: `supabase/tests/database/discussions.test.sql`, using rolled-back pgTAP
fixtures. Historical fixture timestamps are simulated as test owner, restoring all
triggers before client assertions. Real concurrency uses time progression with no
disabled guards. Auth/API/concurrency runners require a **separate disposable** CLI
project named `rollcall_discussion_check` at `backend/.tmp/discussion-supabase`, ports
61321/61322 and the small development catalog seed:

```powershell
pnpm.cmd test:discussions:integration
$env:ROLLCALL_TEST_CONTAINER='supabase_db_rollcall_discussion_check'
pnpm.cmd db:test:discussion-concurrency
```

These opt-in commands refuse other endpoints and never load ordinary env or private
operator files. The integration runner reads only that disposable CLI configuration;
it creates/confirms synthetic local accounts and cleans up its fixtures. It does not
create the stack automatically or reset/import an existing database. Prepare an
isolated stack using a copy of `supabase/config.toml` with that project ID, ports
5532x replaced by 6132x, seed disabled, and copies of migrations/tests. Start it using
`pnpm.cmd exec supabase start --workdir backend/.tmp/discussion-supabase`. Apply the
small `supabase/seed.sql` only inside that disposable database; never import GeoNames.

Before deployment, review migration 25/permission matrix, confirm hosted history through
24, and finish outstanding hosted security acceptance. Follow the existing backup/
recovery procedure. After explicit approval, an operator reviews migration list/dry run,
applies the reviewed migration, and deploys matching backend/frontend under protection.
A dry run does not prove managed role permissions. Smoke-test guest reads, confirmed
users, private outsider 404s, suspension, moderation/demotion and end-time transitions
before broader access. No SMTP changes, showcase seed or deployment is authorized here.

Operator review commands (not executed against hosted Supabase during implementation):

```powershell
pnpm.cmd exec supabase migration list --linked
pnpm.cmd exec supabase db push --linked --dry-run
# Only after separate explicit approval of the pending migration and recovery plan:
pnpm.cmd exec supabase db push --linked
```

Deploy matching applications only under the approvals/protections in
[application hosting](application-hosting.md); do not enable automatic/public deployment
as a side effect. The existing hosted registration/SMTP and security acceptance must be
verified independently before general testers are admitted.

## Local verification record — 2026-10-31

- Disposable fresh-stack migration replay succeeded; final new function was updated
  and verified there after a single-clock consistency improvement. Historical migrations
  were not edited. No ordinary local/hosted database was reset or changed.
- Discussion pgTAP: **65 assertions passed**, including direct client grants/RLS, private
  access, author/host/admin/superadmin boundaries, demotion/suspension, lifecycle,
  pagination, unique reviews, soft deletion, immutable audit and durable rate limits.
- Focused existing SQL suites for suspension, moderation, attendance, covers and viewer
  status passed. PL/pgSQL static check of the new function: **zero errors/warnings**.
- Real PostgreSQL concurrency passed: cancellation blocks a waiting comment, crossing
  ends_at during a lock wait closes comments, and competing reviews create exactly one row.
- Database-backed Fastify/Auth/PostgREST integration passed, using only disposable local
  accounts: registration/login, guest reads, signed requests, cross-user denial, lifecycle,
  participant eligibility, duplicate review rejection, private-field projection and deletion.
- Backend unit suite: **55 tests passed**, including three discussion tests. Frontend
  discussion transport passed; event reads (8), event actions (13), numeric mocks (12)
  passed. No unrelated legacy browser suite was rerun.
- Focused browser journeys passed at **375/1440px in both themes**, with screenshots,
  loading/empty/error recovery, plain-text script safety, reply/edit/review/moderation,
  native confirmations and preview keyboard/focus restoration; no unexpected console errors.
- Root typecheck, lint/boundaries and frontend/backend production builds passed.
  Initial fixture/selector failures and a control-regex lint warning were corrected;
  final checks passed. Hosted migration permissions and hosted application behavior
  remain unverified. No hosted resources, credentials or platform settings were modified.

The disposable stack was removed after verification; retained screenshots/build artifacts
are ignored. No account-role grants or showcase seed data were applied remotely.
