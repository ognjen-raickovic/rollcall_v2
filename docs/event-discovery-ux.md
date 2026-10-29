# Event discovery, previews and card actions

## Behavior

- More filters uses a 250ms CSS grid-row reveal with gentle easing. Controls remain mounted
  and retain unsaved selections when collapsed; collapsed content is inert and hidden from
  accessibility APIs. Reduced motion disables transitions. URL submission and Back/Forward
  still reset controls from the selected URL, including active advanced filters.
- About and Contact have one shared Back to discovery link before the heading, targeting `/`.
  Private-code dialog buttons are Join event on the left and outline Cancel on the right;
  code validation, in-memory storage, disabled states and Escape handling are unchanged.
- Create and edit share the centered max-w-4xl (896px) form without explanatory sidebars.
  All fields, validated location selection, cover workflow, capacity and privacy explanations
  remain. Display labels come from `frontend/src/lib/game-categories.ts`; IDs stay unchanged.
- Cards retain artwork/date/game/title/location/requirements and show actual visibility at
  the image's top-right. Public discovery still includes only public scheduled events.
  My Events can show authorized private/unlisted/cancelled records under its existing API.

| Viewer/state | Card action |
| --- | --- |
| Active verified host | Manage event; opens host editing, never occupies a guest seat |
| Active current participant, open event | Leave event, even when full |
| Active nonparticipant, open public/unlisted table | Join event |
| Guest, open public/unlisted table | Join event opens the authentication explanation |
| Unjoined full table | Full, no joining action |
| Nonhost cancelled / ended / already started | Cancelled / Finished / Closed |
| Private nonparticipant | No ordinary Join; a room code remains required |
| Verification pending / failed | Checking participation / Retry participation; no guessed membership |
| Known signed-in account without active access | Account unavailable |

The host has priority over closed/full states so its management route remains reachable;
existing backend edit rules still govern cancelled/past/moderated records. Leave from a
private card or details asks for confirmation and explains loss of access/code requirement.
The existing future/scheduled rules still govern leaving; the UI does not grant an override.

## Safe, efficient viewer state (migration 24)

`POST /api/events/viewer-status` accepts strict `{eventIds: UUID[]}`, 1–50 unique IDs.
Authentication and the live active-account SQL check derive the owner; there is no actor
parameter. Response: `{userId,items:[{eventId,isHost,hasJoined}]}`. It contains only the
current user's relationship. Missing and inaccessible IDs are omitted identically; known
unlisted UUIDs retain existing direct-read permissions; private events require host/current
membership. No addresses, descriptions, other membership identities, DOB, email or codes.
All responses are no-store and vary on Authorization. SQL independently enforces bounds.

The forward migration adds an invoker RPC and a narrowly projected implementation owned
by the existing NOLOGIN/NOBYPASS event executor, using existing RLS/grants and active guard.
No table privileges, policies, roles, Auth triggers, Storage restrictions or attendance
functions are changed. Anonymous EXECUTE is denied. Temporary migration privileges are revoked.

The frontend batches loaded IDs in groups of at most 50 rather than fetching full details
per card. Viewer keys include UUID and sorted IDs. Responses must match actor/requested IDs
and reject duplicates/contradictory flags. Requests consume abort signals and recheck the
bound session after HTTP. Account, recovery and suspension transitions destroy these queries.
Cards do not infer membership from an omitted row or from separate browser storage.

Existing attendance mutations remain authoritative. They preserve actor capture, duplicate
protection, age eligibility, event locking, host exclusion, capacity and private admission.
Acknowledged responses update counts/self-state and revalidate discovery/My Events; failed
or ambiguous writes refresh server truth. No optimistic membership or private address is
constructed. Success uses one accessible inline message above the grid, so it survives a
card disappearing from a filter/My Events. Errors remain near the card action, including
specific minimum-age failures and account-information guidance. No toast dependency is added.

## Route-backed previews and guest authentication

The `/events` route is a persistent discovery parent with `:eventId` details beneath it.
A normal image/title click from discovery captures the original filter URL, focused link
and scroll position in history state, then navigates to the event URL with that query.
The parent keeps discovery mounted and renders the same EventDetails inside a Radix dialog.
There is one data/controller/presentation implementation, including protected read guards.

Escape, backdrop, close or browser Back returns to the same results; Forward restores the
preview while that discovery parent remains active. Focus and scroll return to the clicked
card after the body scroll lock releases. Modified clicks retain ordinary link behavior.
Opening a direct/shared URL or refreshing, even with persisted history state, renders the
dedicated page because no discovery background was mounted in that navigation lifetime.
Open full event page explicitly clears modal state. Creation/edit routes remain distinct.

Radix handles focus trapping, nested dialogs, background isolation and scroll locking.
Previews scroll internally on small/short screens. Safe loading/error states replace data
after failed access checks; guests/nonparticipants receive no exact address. Covers retain
existing viewer-bound signing and the documented 60-second residual URL window.

Guest Join opens a small dialog with top-left close and Log in / Create account links;
neither Auth form is embedded. `safeReturnTo` restricts the destination to the same app.
Login, registration links and confirmation callback preserve it without adding it to
registration identity fields or Auth metadata. Ordinary signup without a return path
keeps its prior behavior. No return path automatically joins; users explicitly join after
login and the database rechecks current rules. Email delivery/confirmation remains required.

## Rollout and verification

Apply reviewed migrations 1–23, then `20261028000300_event_viewer_status.sql` (24), backend,
then frontend. Preparation/tests do not authorize hosted migration or deployment. If the
new RPC is absent, authenticated participation verification fails visibly instead of
inventing guest membership. Public discovery still works.

Executed against a newly named disposable local Supabase project, separate API/DB ports
60321/60322, with a tiny catalog/place fixture and no GeoNames import or original DB reset:

- All 24 migrations replayed successfully from source.
- `supabase/tests/database/event-viewer-status.test.sql`: 22 assertions passed, including
  anonymous denial, owner-only state, private concealment, SQL bounds, unchanged raw grants,
  host exclusion and live suspension enforcement.
- Existing profile/event age/privacy assertions: 48 passed.
- Real Auth/Fastify/PostgreSQL integration: passed, including batch host/member transitions
  before/after attendance, private outsider omission, both join/host-edit orders, final-seat
  races, age checks and durable private-code attempts.
- Focused backend event/attendance unit checks: 11 passed.
- Viewer client/cache checks: 6 passed; event actions: 13; event reads: 8; covers: 8;
  registration transport/return-path checks: passed. These client checks use synthetic HTTP
  responses and are separate from the database-backed integration above.

- Representative Chrome journeys passed in separate complete dark/light runs: filter
  keyboard/reduced-motion/draft persistence, route previews, nested guest prompts, safe Auth
  returns, refresh/full-page fallback, Back/Forward/backdrop/focus/scroll, joined/host/full/
  closed states, confirmed counts, age/conflict/expired-session feedback, private leave,
  lost-access content removal, account switching, top Back links and centered create/edit.
  Card/preview layout checks passed at 320/375/768/1024/1440 in both themes. The final dark
  run additionally checked creation-form overflow at all five widths. Desktop forms were
  checked in both themes. Screenshots at 375/1440 were inspected. No unexpected console
  errors remained; expected synthetic rejection responses were distinguished explicitly.
  Cold development-server timeouts were diagnosed with targeted runs; assertions allow
  15 seconds for loading. `ROLLCALL_TEST_THEME=dark` or `light` isolates one journey.
- `pnpm.cmd test:mock`: 12 passed, preserving numeric demo contracts/lifecycle.
- `pnpm.cmd typecheck`, `pnpm.cmd lint` and `pnpm.cmd build`: both packages passed,
  including the frontend feature-boundary check.
- `git diff --check`: passed. No existing migration was edited.

Browser tooling uses synthetic accounts/responses only; it does not register hosted users.
No private staging files, local environment files or hosted Supabase resources were changed.
The disposable project was stopped/removed after verification; the original RollCall
database and mail-backup containers were preserved.

## Remaining acceptance

After a separately approved database/backend/frontend rollout, manually check real account
login/confirmation returns, real cover rendering, card join/leave, lost private access and
filter/history behavior on the intended hosting browsers. No hosted email/provider or
application deployment is verified by local fixtures. Relationship state refreshes on focus
and mutations; this milestone does not add realtime attendance subscriptions. Existing
missing-DOB completion and hosted security-acceptance work remain separate requirements.
Verify that the intended hosted Auth redirect configuration permits the confirmation callback
with its safe return query; no hosted allowlist was inspected or changed during this task.

## Changed files

```text
AGENTS.md
CLAUDE.md
README.md
SPEC.md
backend/AGENTS.md
backend/src/db/database.types.ts
backend/src/modules/events/event-repository.ts
backend/src/modules/events/event-routes.ts
backend/src/modules/events/event-schema.ts
backend/src/modules/events/types.ts
backend/tests/events.test.ts
backend/tests/integration/profile-event-ux.test.ts
docs/backend-architecture.md
docs/database-schema.md
docs/entities.md
docs/event-discovery-ux.md
docs/events-api.md
frontend/CLAUDE.md
frontend/DESIGN.md
frontend/package.json
frontend/scripts/check-discovery-ux-ui.mjs
frontend/scripts/check-event-viewer-api.mjs
frontend/scripts/check-registration-api.mjs
frontend/src/app/router.tsx
frontend/src/app/routes/event-browser.tsx
frontend/src/app/routes/event-details.tsx
frontend/src/app/routes/events.tsx
frontend/src/app/routes/home.tsx
frontend/src/features/events/api/event-viewer-api.ts
frontend/src/features/events/api/use-event-viewer-status.ts
frontend/src/features/events/api/use-persistent-event-actions.ts
frontend/src/features/events/components/event-auth-prompt.tsx
frontend/src/features/events/components/event-card-actions.tsx
frontend/src/features/events/components/event-card.tsx
frontend/src/features/events/components/event-cards.tsx
frontend/src/features/events/components/event-details.tsx
frontend/src/features/events/components/event-filters.tsx
frontend/src/features/events/components/event-form-view.tsx
frontend/src/features/events/components/event-participation-summary.tsx
frontend/src/features/events/components/event-preview-dialog.tsx
frontend/src/features/events/components/events-list.tsx
frontend/src/features/events/components/featured-events.tsx
frontend/src/features/events/components/join-private-event.tsx
frontend/src/features/events/components/my-events.tsx
frontend/src/features/games/components/game-categories.tsx
frontend/src/features/games/components/game-summary.tsx
frontend/src/features/information/components/about-content.tsx
frontend/src/features/information/components/contact-content.tsx
frontend/src/features/users/api/auth-api.ts
frontend/src/features/users/api/use-auth.ts
frontend/src/features/users/components/account-status-sync.tsx
frontend/src/features/users/components/auth-callback.tsx
frontend/src/features/users/components/auth-session-sync.tsx
frontend/src/features/users/components/login-form.tsx
frontend/src/features/users/components/register-form.tsx
frontend/src/lib/game-categories.ts
frontend/src/lib/query-keys.ts
package.json
supabase/migrations/20261028000300_event_viewer_status.sql
supabase/tests/database/event-viewer-status.test.sql
```
