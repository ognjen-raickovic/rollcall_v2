# Account navigation and event discovery

## Current responsive navigation

The desktop navbar starts at 1280px, leaving room for the four site links (Explore events,
Host an event, About Us, Contact), optional Admin link and Welcome / account icon / theme
controls. The RollCall logo remains the homepage link. Both modes use one shared site-link
list. Only one navigation mode is mounted, avoiding hidden menus/dialogs and duplicate
visible theme controls. Smaller viewports have a compact logo/hamburger header.

The greeting reads the current UUID's public-safe profile after matching backend identity
and active status verification. Prefer case-preserved username, then display name, then
Account. Pending/failed verification shows no name; cache keys and response UUID checks
prevent another account's cached identity appearing. Email and private profile fields are
never used. Existing Auth/session, status and permission APIs/guards are unchanged.

Mobile navigation uses the existing Radix Dialog dependency: right-side full-height drawer,
backdrop, focus trap/return, scroll lock, Close button and Escape/outside interaction. Links
and route changes close it; switching to desktop removes the drawer. A scrollable body
keeps account/theme controls reachable in short landscape/large-text layouts. Animation
is 250ms and respects reduced motion. Mobile profile is one full-row direct profile link,
not another dropdown. My Events, Settings and confirmed logout remain separate actions.

Logout confirmation stays outside the drawer portal. Closing finishes before confirmation
opens; cancellation returns to the hamburger. Existing button order, initial cancellation
focus, error/pending behavior and SDK local-signout semantics are preserved. Permissions
still determine Admin visibility. Development numeric demos remain explicitly labeled and
never gain real account actions. The same ThemeToggle/store handles both modes.

Focused browser verification uses synthetic intercepted APIs, not hosted Auth acceptance.
The new responsive-navigation suite covers 320/375/768/1024/1440px in both themes, keyboard
and backdrop interaction, username/fallback, pending account switches, roles/suspension,
logout and theme persistence. Existing discovery and information-page fixtures are updated
for drawer navigation. No database/API contract, migration, environment or contact-address
changes are required. Inspect actual staging accounts and touch/screen-reader behavior
after separately approved deployment; do not treat intercepted fixtures as hosted proof.


## Responsive verification

Responsive follow-up checks passed: root typecheck/lint/build and `git diff --check`;
the new responsive-navigation browser suite (five widths, both themes, including an
open-drawer resize); existing navigation/discovery and information-page browser suites;
and 12 mock-contract checks. Representative screenshots were inspected. Build retains
a non-blocking chunk-size advisory. These are local UI/fixture checks, not hosted Auth
acceptance or a physical-device/screen-reader audit. No new dependency was added.

## Verification incident: evidence and limits

The operator's retest succeeded: password login, account status, permissions, countries
and discovery returned 200; the account page worked. The earlier verification error is
**currently not reproducible**, not proven permanently fixed. A missing `/api/me` entry
in a partial capture is not a failed request. At that milestone identity verification ran
on Account Settings and could be cached briefly; the current navbar also verifies identity.
Migration 18 changes registration spelling and a safe profile field,
not token verification, `/api/me` or account-status authorization.

Current ordinary frontend-file diagnostics reported a local Supabase origin; loopback
app ports 3001/5173 were not reachable from this session during inspection. Those results
do not identify the settings of an earlier running app, or a `staging:smoke` child process
whose configuration is explicitly supplied by its launcher. No private env/operator
files were inspected and no hosted authenticated requests were made.

An independent code defect was fixed: identity queries called `authApi.me` without
binding it to the query UUID or rechecking the initiating account after HTTP. The read
now captures the expected UUID, uses the shared no-store/error-preserving transport,
consumes cancellation, verifies the response UUID and rechecks current session identity.
Identity queries are removed on account transitions and retained for no inactive time.
This fixes the reproduced account-switch race without attributing the historical incident
to that race. Account/status errors remain visible, with safe service/HTTP distinctions.
No authentication, confirmation, role, RLS or suspension guard was relaxed.

The games catalog already passes React Query's AbortSignal to fetch. An unused query,
route transition or development StrictMode lifecycle can produce `(canceled)` with no
HTTP error. If the catalog loads normally, this is not a reason to change its behavior.
No games query/cancellation logic was changed.

### Safe operator diagnostics if verification fails again

1. Use the intended mode: `pnpm.cmd dev:all` for local Supabase, or
   `pnpm.cmd staging:smoke` with separate approved application configuration. Do not
   copy operator credentials into either app. Privately verify that frontend and
   backend target the same project and use unprivileged public keys.
2. `pnpm.cmd auth:diagnose` and `node scripts/auth-diagnose.mjs development` print only
   public host/format/override/build-match metadata. They describe files/shell, not
   environment values already injected into a running launcher process.
3. Check proxy reachability without credentials:

   ```powershell
   curl.exe --silent --output NUL --write-out "%{http_code}" http://127.0.0.1:3001/health
   curl.exe --silent --output NUL --write-out "%{http_code}" http://localhost:5173/api/me
   ```

   Expect 200 for liveness and 401 for anonymous `/api/me`. A proxy/connection failure
   or SPA HTML at `/api/me` is a routing/dependency problem, not verified identity.
   These probes cannot validate an authenticated account.
4. In DevTools enable Preserve log, reload `/account`, and record only status plus
   JSON `code` for `/api/me`, `/api/me/account-status`, `/api/me/profile`. Never export
   HAR/curl requests, headers, tokens, keys, passwords or private DOB values.
5. `/api/me` 401 warrants checking session expiry and project/issuer/key alignment;
   do not guess which failed without evidence. `/api/me` 200 with account-status
   `403 FORBIDDEN` can indicate missing/unconfirmed Auth-linked profile identity;
   status 503 indicates an unavailable/invalid status dependency or RPC. A self-status
   response `{status:'suspended'}` is a valid restricted account, not an error to bypass.
   Profile-only errors require checking initialization/schema/RLS independently.
   Escalate with the safe statuses and request time; never disable RLS or confirmation.

## Navigation and My Events

AuthShell keeps its card centered; Back to discovery now sits at the upper-left of the
page content container. Guests have an icon-only Log in link with the existing safe
return destination. Real accounts have a Radix account dropdown: My Profile, Settings,
My Events, separator, Log out. Admin navigation remains separate; numeric demo controls
remain explicitly marked and cannot open real private pages as a fixture identity.

Dropdown keyboard/outside-click/focus behavior uses the existing Radix dependency.
Logout opens the same native confirmation after the dropdown closes; cancellation
focuses No, stay and returns to the avatar. Button order, pending deduplication and
safe failure feedback are preserved. Session loading renders a labeled skeleton.

`/my-events` requires real active Auth. `GET /api/me/events` derives its subject from
the verified bearer, then calls `my_events` under that token. SQL independently invokes
the live active-account guard and limits records to the host or current membership.
Strict query: `relation=hosting|joined`, `period=upcoming|past|all`,
`sort=soonest|latest`, `limit=1..50` (12 default), and matching opaque `cursor`.
No caller-supplied user ID is accepted. Private/unlisted/cancelled records are included
only for that authorized relationship. Summaries never contain addresses, invitation
codes or signed cover URLs. Private cover access uses the existing viewer-authorized API.
Leaving/removing membership removes the record on the next read; Auth/status transitions
destroy the viewer-scoped cache. Mutations invalidate it. Active queries refresh on focus
and every 30 seconds; previously received content cannot be retroactively unseen.

## Public discovery contract

All filters and ordering run in PostgreSQL **before** bounded pagination. Category no
longer filters only loaded pages. `/api/events` still exposes only public scheduled
events in enabled supported countries, regardless of supplied bearer or role.

| Filter | Semantics |
| --- | --- |
| Search/country/city/game | Existing title substring and real catalog/place references |
| `category` | Exact stored game category |
| `period` | Upcoming: start is future; past/Finished: end has passed; all: all scheduled, including ongoing |
| `availability` | all/open/full; open additionally requires future start and spare capacity; full means capacity reached |
| Date from/to | Inclusive civil days in the browser timezone; API uses `startsAfter` inclusive and next midnight `startsBefore` with `startsBeforeExclusive=true` |
| Daily `timeFrom`/`timeTo` | Start times, inclusive minute bounds, interpreted in validated IANA `timeZone`; no overlap or overnight ranges |
| `tags` | All selected tags must match, unique existing vocabulary, at most six |
| `experience` | All-levels matches only all-levels; beginner/experienced each also include all-levels |
| `maxMinimumAge` | Event's advertised minimum age is at most 0..99; no user's age/DOB is read |
| `sort` | soonest/latest start, title A–Z/Z–A; title uses database lowercase with C collation |

API date bounds remain inclusive by default for old callers; the UI's exclusive upper
flag includes the entire selected final day without losing sub-millisecond timestamps.
Civil next-midnight conversion uses calendar arithmetic, not adding 24 hours, so DST
days can span 23/25 hours. Clock filtering uses PostgreSQL timezone rules per event.
The UI names the clock timezone; date boundaries use the current browser's timezone.
Dates/times/sort/filter values persist in the URL; Back/Forward restores drafts and
starts a fresh first page. Invalid/reversed ranges disable requests and show reset help.
Selectors retain native keyboard support with integrated inset chevrons. Eight games
do not need another autocomplete. Advanced fields/tags are under More filters.

Every sort uses UUID as a deterministic tie breaker, in the same direction. Date sorts
preserve original PostgreSQL timestamp precision. Title cursors carry the database's
actual lowercase title key; cursor sort mismatches are rejected. Legacy `{startsAt,id}`
cursors remain soonest-only. Cursors are bounded public positions, not credentials.
Limit-plus-one checks avoid unrestricted counts. Partial title/tag and host/member
indexes support the new paths; no table access is granted to clients.

Pagination is a **live keyset view**, not a cross-request database snapshot. Unchanged
rows paginate without duplicates/omissions. Concurrent inserts before the cursor or edits
that move sort keys require refresh to see a coherent new list; the UI deduplicates IDs.
Do not claim snapshot guarantees under arbitrary edits. No persistent cursor/session
snapshot service is added in this milestone.

### Deliberate deferrals

- Public cancelled-event discovery remains unsupported; it needs a separate visibility/
  moderation policy and DTO review. My Events can show authorized cancelled records.
- Ratings/reviews do not exist. No rating sorts are shown. A future milestone needs
  eligibility/anti-spam/moderation policy, persistent reviews, trustworthy aggregates,
  indexes and matching cursors before adding rating controls.
- Overnight clock windows and event-overlap filtering are not implemented; current
  start-time semantics are explicit. There is no account-age eligibility change.
- Account deletion remains gated; see the updated separate design below.
- Username recovery is deferred: the runtime has no safe username-to-private-email
  lookup capability. A public lookup would create enumeration/spam risk. A future
  isolated dispatch flow needs indistinguishable responses/timing, background queuing,
  durable IP/username/recipient limits, abuse challenges and verified-channel delivery,
  while keeping the browser's PKCE verifier/challenge bound to the recovery flow.
  Username is never ownership proof. Keep existing email-only recovery for this milestone.

## Rollout and manual acceptance

No hosted migrations or deployments were performed. Review pending history and backups
under existing staging safeguards; apply any missing 18 first, then
`20261027000300_event_discovery_filters.sql` (19), then
`20261027000400_my_events.sql` (20), with explicit operator approval. Historical 1–18
are unchanged. These migrations use the established temporary migration-role membership
and revoke it before commit; runtime role membership/grants remain closed. Deploy the
backend before the frontend. Old public discovery clients/default cursors still work.

Manual checklist after approved staging rollout:

1. Compare ordinary login, account verification/status and switching accounts; capture
   only safe status/code if the earlier issue recurs. Check demo isolation separately.
2. Operate the account menu with Enter/Space/arrows/Escape, outside click and touch.
   Cancel logout; confirm only through Yes, log out; test service failure feedback.
3. Check hosted/joined tabs, private membership loss, finished/cancelled records and
   suspended/anonymous denial. No unrelated private event or address may appear.
4. Test combined category/game/location, inclusive date range across a DST boundary,
   clock/timezone, tags, experience and age requirements with actual matching events.
   Check all four sort orders across multiple pages and ties; test refresh after edits.
5. Refresh/share URLs, Back/Forward, reset, no matches and unavailable backend at
   375/1440 in light/dark themes. No credentials or private age data in screenshots.

Local browser scenarios use synthetic intercepted API responses; real HTTP integration
and SQL tests use a separate disposable Supabase on loopback ports 60321/60322. No full
GeoNames import, original database reset or private staging configuration is involved.

## Verification performed

- Root `pnpm.cmd typecheck`, `pnpm.cmd lint`, `pnpm.cmd build` and
  `git diff --check` passed. Build retains a non-blocking 500 kB chunk advisory
  (main chunk approximately 587 kB before gzip).
- Backend Auth/event/discovery unit tests: 12 passed. Real HTTP discovery/My Events
  integration: 1 passed; isolated registration integration also passed during setup.
  These used confirmed disposable identities, not hosted accounts.
- Disposable database regression: 16 files / 513 assertions passed. After adding one
  more combined-filter case, the final focused discovery/personal-events SQL file
  passed all 37 assertions. These counts overlap; they are not additive test totals.
  Historical finished/DST fixtures temporarily disable only the future-date write
  validator inside a rolled-back test transaction, then restore it before assertions;
  RLS, authentication and attendance security remain enabled.
- `pnpm.cmd test:discovery`: 2 tests passed (civil dates/DST/URL validation and
  initiating-account verification). Existing event-read and event-action checks
  passed 8 and 12 tests respectively.
- `pnpm.cmd test:navigation-ui`: passed at 375/1440 px in dark/light themes, covering
  menu keyboard/focus/outside-click behavior, logout cancellation/confirmation,
  My Events, filter requests/URLs/back/forward/reset, errors and empty results.
  Screenshots were inspected. Intercepted browser responses do not prove hosted
  authentication or database behavior; the separate SQL/HTTP checks cover local persistence.

Changed implementation areas: users authentication/session/menu/AuthShell; events
filters, DTOs, cards, personal query hook and page; shared native FormSelect; geography
filter presentation; backend discovery validation/cursors/repository and the new
personal-event route; additive migrations 19/20 and focused SQL/API/browser checks.
No new dependency, historical migration change or hosting configuration change is required.
Original local Supabase data and the mail-backup container were preserved; only the
disposable verification project's resources are cleaned up.
