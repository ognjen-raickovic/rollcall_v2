# Profile and event UX follow-up: contracts and verification

## Root causes and behavior

- My games ignored the chooser until Add committed it to the local array. The effective
  draft now includes the current valid game/level. Selecting Yu-Gi-Oh! and Veteran enables
  Save; Add another game retains that choice and clears the chooser. Only Save writes.
  Duplicate protection, atomic expected-set replacement, conflict reload, failure drafts
  and Cancel remain. Refresh shows the persisted selected experience.
- Profile Save previously had no effective-change guard. It now compares valid normalized
  editable values, trimming display name/biography and comparing country/city IDs. Reverting
  an edit disables Save; read-only account dates/DOB-derived year cannot dirty it.
- The user confirmed the stored handle is lowercase, while displayName is mixed case.
  This is persisted spelling, not a navbar lowercase transform. We did not inspect a hosted
  account or establish its creation/migration history. Migration 18 preserves new spelling;
  it intentionally does not rewrite old handles. Desktop Welcome now uses displayName and
  updates after its acknowledged save. Mobile retains the separate handle-first label.
- Navigation treated harmless identity/status `isFetching` as lost verification. It now
  retains matching successful same-UUID data during background refetch, with a fixed-width
  truncated greeting. Real errors/access loss and account switches still clear the label.
  Initial verification never borrows another account's label. Auth/status checks still run.
- Account created uses a wrapping baseline-aligned row, the same UTC English date formatter
  (for example `27. October 2026.`), and no Read-only suffix. It remains uneditable.

## Explicit username capitalization correction

In `/profile/edit`, the separate **Username capitalization** form accepts a case-only
spelling such as `ognjen3211` to `Ognjen3211`. **Update capitalization** sends
`PATCH /api/me/username-casing` with `{username, expected}`. The verified active UUID is
the sole owner identity. A narrow checked RPC locks the owner row, validates ASCII handle
format and unchanged lowercase identity, and compares exact expected spelling (409 on
stale input). Existing case-insensitive uniqueness remains; raw client UPDATE is denied.
No automated changes, arbitrary renames, role changes or username recovery are introduced.
Display names and permanent UUIDs remain separate; Auth, events and references keep UUIDs.

## Event recommendations and tags

New event recommendations are **All levels** (first-timers welcome), **Intermediate+**
(basic rules knowledge) and **Veteran+** (highly experienced). Three levels suffice without
inventing a first-timer player qualification. Player My games remains independently
beginner/intermediate/veteran, self-declared and never an enforced joining qualification.

Historical `beginner` and `experienced` event values remain stored and are explicitly
labeled legacy; neither is silently mapped to a new value. New discovery recommendation
filters match exactly; legacy filters retain their prior include-all-levels behavior.

New selections offer six tags: Casual, Competitive, One-shot, Campaign, Bring your own deck,
Equipment provided. Casual/Competitive and One-shot/Campaign are exclusive, with disabled
incompatible options and visible explanations. Equipment tags may coexist. No silent removal.
Beginner friendly/Veterans only remain readable/removable on old records. New creates cannot
select them or old recommendation values. Actual rule changes must remove legacy experience
tags and resolve conflicts explicitly. Unchanged historical rules survive unrelated database
PATCHes/counter updates; the full form may require resolving conflicts before saving.
Frontend validation, backend Zod and a database trigger enforce these rules independently.

Safe public/My Events summaries add actual stored minimumAge and experienceLevel. Cards
and details use shared compact badges; age zero omits its badge. During database-first
rollout readers tolerate absent new summary fields and omit badges rather than invent values.
Details still require both. No per-card private-detail or DOB query is introduced.

## Minimum-age admission policy

Age is now an enforced new-seat requirement, based on **self-declared**, not verified, DOB.
The closed SQL helper reads only the current owner's private DOB through a separate
NOLOGIN/NOBYPASS executor and owner RLS. Event/invitation executors gain helper EXECUTE,
not DOB SELECT; anon/authenticated cannot call the helper. DOB is never returned in public
profiles/events, organizers' responses, JWT metadata or diagnostic messages.

- Check the event start's local calendar date: ME `Europe/Podgorica`, RS `Europe/Belgrade`,
  BA `Europe/Sarajevo`, HR `Europe/Zagreb`. The required birthday is eligible from local
  midnight on that date. Feb 29 birthdays use Feb 28 in non-leap years.
- Minimum age zero requires no DOB. No global RollCall account minimum age is added.
- Restricted new seats with no complete DOB fail closed. Birth year alone is insufficient;
  never infer a birthday. Account Settings explains contacting support for a reviewed
  resolution, without emailing DOB. **No self-service DOB completion/change endpoint is
  implemented here**; legacy accounts remain blocked from restricted joins until resolved
  through a separately reviewed process. They can join all-ages events normally.
- Ordinary join and private-code redemption check current age/start/location under the
  existing parent event row lock. Host edits and joins serialize. Visibility, suspension,
  host exclusion, capacity checks and trigger-maintained attendance remain.
- Existing seats are grandfathered after age/date/location edits, with no automatic
  removals or count changes. Repeat joins remain idempotent; normal future/scheduled checks
  still apply. Leave remains available under existing state rules; a subsequent new join
  must satisfy current eligibility and visibility/code rules.
- HTTP 403 `AGE_REQUIREMENT_NOT_MET` gives friendly event-specific feedback; missing DOB
  uses `AGE_INFORMATION_REQUIRED` and Account Settings guidance. Private redemption returns
  safe internal statuses before HTTP mapping, so failed attempts **commit** the existing
  durable rate limiter and disclose no event ID. Invalid codes do not become an age oracle.

Numeric demos do not possess real DOB/UUID identities and do not enforce this private-DOB
policy. Their new-create/tag logic uses current recommendations, while existing demo records
remain readable. A demo login never supplies real admission identity.

## Feedback and mobile presentation

Shared lightweight `ActionFeedback` uses an inline polite status live region, without a
toast dependency or animation. Profile/event route successes are consumed through replace
navigation and cannot replay on refresh/Back. Join/leave feedback resets for a different
viewer/event. Existing pending labels, validation errors, separate 409 handling, failed
draft retention, destructive confirmations and Auth confirmation/recovery flows remain.
No success precedes an acknowledged response, and raw provider errors remain sanitized.
Mobile hero copy/compact CTAs, section headings and footer center through responsive classes;
form labels/search controls/cards remain left aligned. Desktop composition is preserved.

## Forward-only rollout and limits

After migrations 1–21, review/apply **22** `20261028000100_username_case_correction.sql`,
then **23** `20261028000200_event_requirements.sql`, then backend, then frontend.
These add narrow roles/functions/policies and extend existing functions without changing
their ACLs/owners or historical files. Temporary migration memberships/schema privileges
are revoked. Auth initialization and Storage policies are untouched. No new secret,
service-role client, dependency, environment variable or hosted operation is introduced.
No migration or account change was executed on hosted Supabase or the original local DB.

Hosted role execution privileges and acceptance still require the existing separately
approved rollout procedure. Do not infer hosted verification from disposable tests.

## Executed verification

All database checks ran on a fresh, isolated, disposable local Supabase project (API60321,
DB60322), replaying the final 23 migration files without manual privilege repair. Only tiny
representative catalog/geography fixtures were seeded; no GeoNames import or original DB reset.

| Check | Result |
| --- | --- |
| New rollback-only `supabase/tests/database/profile-event-ux.test.sql` | 48 assertions passed, including DOB-owner RLS and live suspension checks |
| Existing suspension / username-casing / profiles / atomic game-set SQL | 21 / 17 / 42 / 24 assertions passed |
| `backend/tests/integration/profile-event-ux.test.ts` | Passed against real local Auth, API and PostgreSQL |
| Focused backend events/discovery/profiles unit tests | 10 passed |
| `pnpm.cmd test:mock` | 12 passed |
| `pnpm.cmd test:events` | 8 passed |
| `pnpm.cmd test:event-actions` | 13 passed, including new recommendation/tag contracts |
| `pnpm.cmd test:profiles` | 5 passed, including new casing client identity checks |
| `pnpm.cmd test:profile-editor-ui` | Four width/theme scenarios passed |
| `pnpm.cmd test:profile-event-ux` | Passed in both themes, widths 320/375/768/1440 |
| `pnpm.cmd test:responsive-navigation` | Passed: guest, long name, switch/logout, drawer/keyboard/theme/access |
| `pnpm.cmd typecheck`, `pnpm.cmd lint`, `pnpm.cmd build` | Both packages passed; existing Vite chunk-size warning remains |
| `git diff --check` | Passed |

The new integration test is opt-in with `RUN_PROFILE_EVENT_UX_INTEGRATION=true`, using
explicit disposable local API/DB configuration and provisioned synthetic operation keys;
it refuses non-loopback/other-port targets. It verifies birthday boundaries, missing DOB,
cross-owner writes, safe DTOs, both join-vs-host-edit orders, grandfathering, competing final
seats and real private-code denial with committed attempts. Its fixtures are cleaned up.
SQL assertions roll back. Browser tests use synthetic HTTP fixtures, not hosted credentials;
screenshots were inspected and expected 403s distinguished from unexpected console errors.
The pre-existing authenticated private-table SELECT remains owner-only through RLS;
the private schema is not exposed by the Data API. This follow-up does not broaden that
access. Full DOB is omitted even from the own-profile HTTP response. Test-only age-role
membership and pgTAP access exist only inside the rolled-back assertion transaction.

Manual acceptance after approved rollout: correct a real account's capitalization explicitly,
change its display name and confirm the greeting, save/refresh both profile tabs, and test
both ordinary/private-code age errors. Review a legacy event deliberately before changing
its recommendation/tags. A reviewed missing-DOB completion policy remains separate work.

## Exact changed-file manifest

```text
AGENTS.md
CLAUDE.md
README.md
SPEC.md
backend/AGENTS.md
backend/src/db/database.types.ts
backend/src/modules/events/event-invitations.ts
backend/src/modules/events/event-repository.ts
backend/src/modules/events/event-schema.ts
backend/src/modules/events/event-tags.ts
backend/src/modules/profiles/profile-repository.ts
backend/src/modules/profiles/profile-routes.ts
backend/src/modules/profiles/profile-schema.ts
backend/src/modules/profiles/types.ts
backend/tests/integration/profile-event-ux.test.ts
backend/tests/profiles.test.ts
docs/backend-architecture.md
docs/database-schema.md
docs/entities.md
docs/events-api.md
docs/navigation-discovery.md
docs/private-invitations.md
docs/profile-event-ux.md
docs/profiles.md
frontend/CLAUDE.md
frontend/DESIGN.md
frontend/package.json
frontend/scripts/check-event-actions.mjs
frontend/scripts/check-mock-api.mjs
frontend/scripts/check-profile-editor-ui.mjs
frontend/scripts/check-profile-event-ux-ui.mjs
frontend/scripts/check-profiles-api.mjs
frontend/scripts/check-responsive-navigation-ui.mjs
frontend/src/components/action-feedback.tsx
frontend/src/components/layout/app-layout.tsx
frontend/src/features/events/api/event-dtos.ts
frontend/src/features/events/api/event-validation.ts
frontend/src/features/events/api/event-write-dtos.ts
frontend/src/features/events/api/events-api.ts
frontend/src/features/events/api/persistent-event-form-values.ts
frontend/src/features/events/components/discovery-hero.tsx
frontend/src/features/events/components/event-card.tsx
frontend/src/features/events/components/event-details-view.tsx
frontend/src/features/events/components/event-details.tsx
frontend/src/features/events/components/event-filters.tsx
frontend/src/features/events/components/event-form-view.tsx
frontend/src/features/events/components/event-notice.tsx
frontend/src/features/events/components/event-participation-summary.tsx
frontend/src/features/events/components/event-requirement-badges.tsx
frontend/src/features/events/components/event-tag-select.tsx
frontend/src/features/events/components/featured-events.tsx
frontend/src/features/events/components/how-it-works.tsx
frontend/src/features/events/event-tags.ts
frontend/src/features/events/types.ts
frontend/src/features/games/components/game-categories.tsx
frontend/src/features/users/api/profiles-api.ts
frontend/src/features/users/api/use-navigation-account.ts
frontend/src/features/users/api/use-profiles.ts
frontend/src/features/users/components/account-information.tsx
frontend/src/features/users/components/own-profile.tsx
frontend/src/features/users/components/profile-editor.tsx
frontend/src/features/users/components/profile-form.tsx
frontend/src/features/users/components/profile-games-draft.tsx
frontend/src/features/users/components/session-menu.tsx
frontend/src/features/users/components/username-casing-form.tsx
frontend/src/lib/http-client.ts
frontend/src/lib/use-route-feedback.ts
package.json
supabase/migrations/20261028000100_username_case_correction.sql
supabase/migrations/20261028000200_event_requirements.sql
supabase/tests/database/profile-event-ux.test.sql
```
