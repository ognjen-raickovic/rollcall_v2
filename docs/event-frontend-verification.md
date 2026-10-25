# Milestone 4C-1 frontend event read verification

Verified locally on 25 October 2026 on `feat/event-frontend-integration`. This milestone
connects event reads only. No branch change, staging, commit, push, merge, deployment,
remote Supabase operation, database reset, migration or GeoNames import was performed.
Credentials/tokens were not printed. Local fixture accounts/events were created only for
verification and removed afterward.

## Delivered files and pages

The homepage's featured events, `/events` and `/events/:eventId` now use real Fastify data.
Homepage categories and discovery game selectors use the database catalog. Production reads
never mix numeric fixtures or fall back to them when a service is unavailable. Empty local
databases show genuine empty states rather than invented activity.

New event read files are `api/event-dtos.ts`, `persistent-events-api.ts` and
`use-persistent-events.ts`. They define runtime-validated UUID summaries/details/pages/filters,
GET-only clients and TanStack Query hooks. Existing EventCard, EventsList, FeaturedEvents and
EventDetails consume those contracts. `EventDetailsView` extracts the existing presentation
for both real and numeric demo controllers; `EventParticipationSummary` displays viewer
state and deliberately disabled actions. No parallel event feature or backend type import
was introduced. Default cover paths remain the existing local illustrations.

Routes compose the real catalog, geography controls and users `useApiSession` hook. Users
adds a verified-session token getter and sensitive-cache cleanup; `lib/query-keys.ts` shares
the detail prefix without feature-to-feature imports. The shared HTTP client adds safe
event-specific errors, same-configured-origin API path checks and redirect rejection.
Root/frontend packages add `pnpm test:events`; no dependencies or lockfile changes are needed.

`/events/new` and `/events/:eventId/edit` explain pending hosting. Numeric fixtures/forms/
attendance remain under opt-in development `/demo/events`, `/demo/events/new`,
`/demo/events/:eventId` and `/demo/events/:eventId/edit`, with clearly marked nonpersistent
data and their own numeric actors. Success/cancel/edit/leave links stay inside that namespace.
These routes and player selection are unavailable in production, even if the demo flag is set.
Existing mock API tests were retained; historical browser tests now target isolated demo paths.

README, SPEC, entities, event API, roadmap, Codex/Claude shared instructions and scoped data
rules were updated. DESIGN documents read-only controls, loaded-count pagination and summary
pricing limits without changing the palette or layout.

## DTO, filters and privacy

Real event/account IDs remain UUIDs, while game/city/country references remain actual positive
database integers. Summary cards use structured game/location fields, default cover, capacity,
participantCount and availableSlots. They omit addresses and price, which discovery DTOs do
not contain. Details use actual host/game/location/schedule/tags/experience/price and viewer
state; no fake attendee array or numeric organizer adapter is created.

Discovery uses chronological cursor pages from `pageInfo.nextCursor` with title, country,
city ID, game ID, upcoming and available-seat filters. Query keys include normalized filters
and category scope; page parameters hold cursors. URL/back/forward state is preserved. Invalid
or repeated/unknown filter keys show reset guidance without an event request. Inactive page
series are discarded, so changing filters and returning starts at the first cursor. Load More
retains existing cards on a subsequent-page error and offers retry.

The backend does not accept category as a filter. Category filtering applies to loaded pages
in chronological order and keeps Load More visible even when no category match is loaded yet.
Empty-category results are final only after exhaustion. Counts say how many matching records
are loaded; no global total is invented. Loading, empty, invalid-query, unavailable-service
and retry states are implemented without fixture fallbacks.

Viewer detail keys are `[...EVENT_DETAILS_QUERY_KEY,eventUUID,viewerUUIDOrNull]`. Details have
zero inactive cache retention, no previous-viewer placeholders and consumed abort signals.
The route-composed getter checks the actual SDK session against the independently observed
account before and after HTTP. DTO viewer UUID and host flags must agree. Public DTO branches
strip unexpected addresses/private fields; UI independently checks matching viewer identity
and host/current-membership authorization before passing address text to the shared view.
Cards and page metadata never receive protected detail fields.

Login/registration/logout/reset/recovery and SDK account transitions remove sensitive event
queries before new account state can render. Auth pending/errors and failed detail refetches
suppress cached protected content. SDK refresh remains supported; an unverifiable session
shows login guidance rather than anonymous reuse of authenticated data. Tokens never enter
keys, URLs, logs or screenshots; authenticated fetches are restricted to the configured API
origin and reject redirects. Browser traces are disabled for real-session suites.

## Executed checks

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Frontend/backend passed |
| `pnpm lint` | Both passed with frontend boundaries; final run has no lint warnings |
| `pnpm build` | Both production builds passed |
| `pnpm test:events` | Seven focused client/query scenarios plus parent passed (eight Node entries) |
| `pnpm test:mock` | Eleven scenarios plus parent passed (12 entries), including numeric CRUD/join/leave/covers/tags |
| `pnpm test:geography` | Five client scenarios plus parent passed (six entries) |
| `pnpm test:profiles` | Two client scenarios plus parent passed (three entries) |
| `pnpm test:backend` | All 34 unit tests passed |
| Focused local backend integrations | All 16 entries passed across event, attendance, Auth, profiles and geography files, including genuine PostgreSQL races |
| Real event browser matrix | Eight scenarios passed: discovery and viewer/privacy journeys at 375px/1440px in dark/light |
| Existing browser regressions, 1440px dark | Seven passed across Auth (two), profiles (two), geography/demo workflows (three) |
| `git diff --check` | Passed |

Client tests validate actual DTOs, bounded filters/cursors, missing/malformed IDs before HTTP,
public address stripping, host/participant authorization, viewer mismatches, sanitized errors,
abort propagation and identity changes before/after HTTP. A real TanStack InfiniteQueryObserver
test loads two Alpha pages, switches to Beta, then verifies returning to Alpha requests a null
cursor instead of restoring the accumulated pages.

The new browser suite starts with two genuinely registered/confirmed local accounts, creates
14 public events plus private fixtures through authenticated Fastify calls, and uses the real
database game/city catalogs. It verifies 12+2 cursor pagination, country/city/game/title/
availability/category filters, reset/back/forward, keyboard city selection, empty and invalid
states, network failure/retry, honest pending actions and separate numeric demo navigation.
Only the intentional error case aborts a request; normal reads and protected fixture responses
come from the actual backend.

Viewer journeys check anonymous/host/participant/unrelated access and private concealment,
malformed/missing UUIDs, logout, and two real account switches without replacing the app's
QueryClient. A real host detail response is held while Auth switches accounts; its late
completion cannot render the previous address or repopulate the active viewer state. The
test checks protected state before/after and verifies participant-only access with a real
membership. Expected missing-resource/network errors are distinguished from unexpected
console errors; no unexpected browser console errors or page exceptions were observed.

Screenshots of homepage, discovery, host and participant details are saved under ignored
`frontend/test-results/` in all four viewport/theme projects. Mobile/desktop screenshots were
visually inspected; overflow checks passed. The existing design/tokens are preserved, with
native seat-progress fills using the primary token rather than browser-default green.

No SQL schema changed, so database migrations/lint/assertion suites were not rerun for this
frontend milestone. Existing local backend integrations, including attendance concurrency,
were run. The full GeoNames importer and unrelated browser suites were not run.

Final local aggregate counts match the pre-work baseline: 46,243 cities, 23,401 aliases and
eight games; zero Auth users, profiles, events, protected locations or memberships. No user
records or geography were reset. The development seed remains empty of persistent events,
so opening the app after fixture cleanup correctly shows no upcoming events. Test screenshots
and the temporary local server launcher are ignored artifacts, not commit deliverables.

## Local setup and fixture verification

Use the existing local Supabase stack, backend environment and ports. Configure the existing
public Supabase URL/publishable key in ignored `frontend/.env` for real Auth, then run
`pnpm dev:backend` and `pnpm dev` in separate terminals. Vite proxies `/api` to Fastify.
No new environment variables or hosted resources are required. Without frontend Auth
configuration, anonymous public event reads still work; real viewer access needs configuration.
No persistent events exist in the development seed, so the public empty state is expected
until real events are created. Do not use a reset or numeric fixture fallback to populate it.

To reproduce real-event browser verification with isolated local API fixtures:

```powershell
$env:RUN_LOCAL_EVENT_READ_UI = 'true'
pnpm.cmd --filter frontend exec playwright test tests/events-read-ui.spec.mjs
Remove-Item Env:RUN_LOCAL_EVENT_READ_UI
```

The suite loads ignored local backend configuration, rejects non-loopback targets, never
hardcodes credentials/tokens, and cleans only its generated accounts/events. It is not a
permanent seed command. Production data is never touched. For demo regressions only, enable
`VITE_ENABLE_DEMO_MODE=true` and restart Vite; this does not enable demos in production.

## Remaining scope and readiness

4C-1 is ready for PR review based on local verification. Hosted deployment, production load/
abuse checks and event mutation UI remain untested/unimplemented here. Category matching
requires loading further pages when matching events occur later. Discovery summaries have
no pricing badge. PostgreSQL uses normal read snapshots; already delivered data cannot be
recalled, but new reads/account transitions enforce current viewer authorization.

4C-2 must add real create/edit/delete/join/leave clients, payload adapters, form validation,
mutation feedback and viewer/public cache refresh. Handle private leave losing access,
401/404/409 conflicts, capacity races and actual UUID actors. Replace pending public controls
deliberately; never reuse a numeric demo actor or submit mock image data URLs. Storage/default
cover replacement is 4D, and private codes/role overrides remain Milestone 5.
