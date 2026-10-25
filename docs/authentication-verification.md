# Milestone 3A verification

Implemented on `feat/real-auth` and verified against local services on 24–25 October 2026.
No branch switch, commit, push, merge, deployment, remote project operation or database
reset was performed. Existing geography data was preserved. A separate user edit in
`frontend/CLAUDE.md` was left intact.

## Delivered behavior

- Real Supabase email/password registration, password confirmation, login and local logout.
- Confirmation/resend and PKCE callbacks, including confirmation-enabled local Auth.
- Password recovery emails, recovery-session restoration after refresh, password update
  and explicit login with the replacement password.
- SDK session persistence/automatic refresh and authentication-aware navigation.
- Minimal `/account` identity summary with a real authenticated Fastify request.
- Reusable backend signature verification and guard for `GET /api/me`; issuer, audience,
  expiration, not-before, UUID and authenticated/non-anonymous account checks.
- Explicit development-only numeric demo identities, separate from real account UUIDs.
  Production cannot select demo profiles or acquire fixture host access from a stored ID.
- Unchanged mock event/catalog APIs and working development-demo event journeys.

Real accounts can browse mock events but cannot host, edit or join as a numeric fixture.
No profile editing, per-game experience management, persistent event API, private code,
upload integration or administrative workflow was added.

## Files

New backend source is `backend/src/modules/auth/{types,token-verifier,auth-guard,auth-routes}.ts`.
`backend/src/app.ts` registers the guard/routes. New unit/integration coverage is in
`backend/tests/auth.test.ts` and `backend/tests/integration/auth.test.ts`.

The users feature adds `api/auth-client.ts`, `api/auth-api.ts`, `api/use-auth.ts` and
components for registration, recovery/reset, callback/session synchronization, account
summary, shared auth fields/layout, mock-event notice and separate demo login. Existing
login, session-menu, route guard, session API/hooks and user types were updated.
App composition adds register, forgot-password, reset-password, callback, account and
demo-login routes; router/providers and event-detail composition were updated. Event
attendance accepts a route-supplied availability flag without importing the users feature.

Database changes are `supabase/migrations/20261024000400_auth_profile_initialization.sql`,
new `supabase/tests/database/auth.test.sql`, local callback configuration, and small fixture
adaptations in the foundation/concurrency/geographic-import tests. The migration creates
only a fixed-placeholder profile on registration and backfills missing profiles. It
preserves existing rows, grants/RLS, geographic IDs and deny-by-default application access.

Configuration changes are `frontend/.env.example`, the matching Supabase dependency in
`frontend/package.json`, and `pnpm-lock.yaml`. New browser scenarios are in
`frontend/tests/auth-ui.spec.mjs`; legacy location scenarios now explicitly enter demo mode.
The geography client's obsolete scope comment was updated; geographic behavior is unchanged.

Updated documentation includes root `README.md`, `SPEC.md`, `AGENTS.md`, `CLAUDE.md`,
frontend `CLAUDE.md`/`DESIGN.md`, backend `AGENTS.md`/`README.md`, and entity, schema,
architecture, roadmap and location integration docs. New [authentication setup](authentication.md)
explains public configuration, local mail, UUID/demo boundaries and future milestones.

## Executed automated checks

| Check                                      | Result                                                               |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `pnpm typecheck`                           | Frontend and backend passed                                          |
| `pnpm lint`                                | Both passed, including feature boundaries; final run had no warnings |
| `pnpm build`                               | Both passed; final build also passed with Fastify stopped            |
| `pnpm install --frozen-lockfile`           | Passed                                                               |
| `pnpm test:mock`                           | 12 TAP checks passed                                                 |
| `pnpm test:geography`                      | 6 TAP checks passed                                                  |
| `pnpm test:backend`                        | 21 tests passed, including 5 new auth tests                          |
| Local opt-in `pnpm test:integration`       | 4 passed, none skipped, including genuine Supabase Auth              |
| `pnpm db:lint`                             | No schema errors or warnings                                         |
| `pnpm db:test`                             | 119 assertions passed across 3 files; 19 new auth assertions         |
| `pnpm db:test:concurrency`                 | Both capacity/attendance race checks passed                          |
| Development `pnpm test:ui`                 | All 20 scenarios passed, none skipped                                |
| Production-preview auth browser scenarios  | Both passed at 1440px/dark                                           |
| Production identity-isolation/visual smoke | Both widths and themes passed; console-error arrays empty            |

Commands used `pnpm.cmd` on PowerShell. The Windows sandbox blocked the TypeScript test
runner's user-info lookup and pnpm's shared-store lock, so affected checks were rerun
outside that sandbox and passed. Docker/database commands required local Docker access.
These environment failures were not counted as passing checks before the successful rerun.

An early setup diagnostic printed local-only container credentials in tool output. Its
filtering was corrected; those values were not copied into tracked files. No production
credentials or remote project were involved.

## Browser coverage

The full development run used installed Chrome, with five scenarios in each configuration:

| Width  | Theme | Result   |
| ------ | ----- | -------- |
| 375px  | Dark  | 5 passed |
| 375px  | Light | 5 passed |
| 1440px | Dark  | 5 passed |
| 1440px | Light | 5 passed |

Eight of these cases cover real auth/validation and twelve retain location/event regression
coverage. Real-account cases register random test accounts, reject mismatched passwords and
unconfirmed login, follow actual Mailpit confirmation links, verify the UUID through
`/api/me`, refresh the page, confirm mock hosting/attendance isolation, log out, reject bad
credentials, handle duplicate registration, follow real recovery links, refresh the recovery
page, update the password and sign in again. Geography remains usable after real login.

The regression cases retain four-country event creation/editing, optional venues, selected
IDs, combined discovery filters, reset/history, join/leave/address display, keyboard city
selection, aliases, retry, debounce and stale-response isolation in explicit demo mode.

Production review builds with demo opt-in present, then confirms that `/demo/login` is
unavailable, its login link is absent, a manually inserted legacy demo ID cannot unlock
hosting/editing/addresses, and attendance stays disabled. It checks responsive auth forms,
horizontal overflow and console errors in all four viewport/theme combinations. The real
confirmation/recovery journey was also repeated successfully against production preview.
Screenshots were visually inspected; themes and existing semantic tokens remain unchanged.

Expected invalid-credential/unconfirmed-login HTTP failures and deliberately simulated
geography outages are handled states, not unexpected application errors. Ordinary journeys
have no uncaught page exceptions. Production smoke checks have no console errors.

Local screenshots and production smoke JSON are in ignored `backend/.tmp/auth-review/`.
Playwright writes ignored `frontend/test-results/`, replacing it on each invocation; review
screenshots were copied separately before the production run. Do not publish traces or
mailbox exports, which may contain temporary passwords or one-use authentication links.

## Local execution and preserved data

The new migration was actually applied using `supabase db push --local`; SQL was not merely
prepared. Final database checks found 46,243 total city rows, including the original 46,241
GeoNames places and two source-free seeds, plus 23,401 aliases. No import/reset was needed.
Temporary browser/integration accounts were deleted individually; none remained at handoff.

The pre-existing partial Supabase stack lacked its configured SMTP capture service. A
local Mailpit container was started on the Supabase network, listening on loopback port 55324. No external email service or production project was used. Normal local stack setup,
environment names, callback origins and test opt-ins are in [authentication](authentication.md).
Ignored `frontend/.env.local` was prepared with the local public URL/unprivileged key and
explicit demo opt-in for development regression testing; it is not a deliverable or secret
credential source. Temporary application servers were stopped; the local database/Auth/mail
services were left running.

## Limits and next milestones

Logout clears the browser session and revokes its refresh capability; already-issued access
JWTs may remain valid until expiry. There is no immediate token denylist or device-management
UI. Browser token persistence relies on supported browser storage and ordinary XSS defenses.
PKCE links require the same browser/origin that initiated the flow. Local email confirmation
is enabled; production SMTP, hosted redirects/CORS, rate-limit tuning, deployment and remote
Supabase were not tested or configured.

Only Chrome was exercised. Firefox/Safari, physical devices and screen-reader audits were
not performed. Mock event data still resets on reload and exact addresses remain present in
client-side fixtures; their UI restriction is not server authorization. Real accounts never
inherit demo identity. No durable event participation is claimed.

Milestone 3A is ready for PR review with these limits. Milestone 3B can add profile onboarding,
self-only editing and per-game experience with focused RLS/grants. Milestone 4 can replace
numeric event/attendance dependencies with explicit UUID adapters and verified server APIs.
