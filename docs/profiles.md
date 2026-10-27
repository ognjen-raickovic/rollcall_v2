# Milestone 3B: real profiles and per-game experience

## Current profile editor (migration 21)

`/profile/edit` is a centered 672px single column with Profile and My games tabs.
The explanatory sidebar is removed. Radix supplies keyboard/ARIA tab behavior; both
panels remain mounted to preserve independent drafts. `?tab=games` supports refresh,
Back/Forward and direct links. A quiet 180ms entry transition honors reduced motion.
Leaving the editor (Cancel, Back to My Profile or browser navigation to another route)
discards unsaved drafts; tab-history navigation preserves them. A successful save saves
only the selected tab and returns to `/profile`, matching the existing profile workflow.

Both tabs use Save changes / Cancel. My games adds, edits and removes locally, with no
mutation until Save; unchanged sets send no request. Failed saves retain drafts. Reload
after a conflict is an explicit **Discard draft and reload saved games** action.
Owner UUID keys remount the editor on account changes; batch requests abort on unmount/
account transitions and recheck the current SDK account after HTTP before reporting success.
Confirmed saves cancel old reads and invalidate own, experience and public profile queries.

`PUT /api/me/game-experience` accepts `{ games, expected }`: complete desired and last
saved sets of `{ gameId, experience }`, each unique and at most 50 entries. The checked
SECURITY INVOKER RPC `replace_my_game_experience` uses current active Auth identity,
existing RLS, catalog/level validation and a single transaction. Sorted value comparison
rejects a changed saved set with 409; this is value-based compare-and-swap, not a revision
history. A change later reverted to the exact same set is treated as unchanged. All
authenticated table writes, including legacy RPCs/Data API, take the same per-account
statement lock before row locks, after role/account suspension guards. No new private
fields or privileged runtime client are introduced.

Forward migration `20261027000500_profile_game_sets.sql` follows 1–20. Review and approve
database application separately, then deploy backend before frontend. It has only been
applied to a disposable local verification project. Historical migrations are unchanged.
The earlier per-game endpoints remain compatible; the editor exclusively uses batch Save.

Shared BackLink uses the shared primary Button and an arrow across
auth, profile and event return controls. Account Settings removes Browse events, retains
profile/security navigation, and shows a disabled Delete account control. Full creation
dates in Settings/editor use UTC and English `27. October 2026.` formatting. Event dates
and short public Member since labels are unchanged. Deletion remains blocked for the
specific gates in [the separately reviewable design](account-deletion-design.md).

The auth-casing follow-up (forward migration 18) preserves new username spelling while
keeping identity uniqueness case-insensitive. Public/own DTOs accept optional nullable
`username`; shared profiles/settings display it as `@username`, separately from display
name. Existing lowercase handles remain unchanged and cannot be recased by profile PATCH.
Full DOB, email and roles remain absent from public DTOs. See [rollout](auth-experience.md).

New registration additionally requires a unique immutable username and private DOB;
legacy accounts keep optional birth-year editing. Own profile exposes `hasDateOfBirth`
and a read-only derived birth year for DOB-backed accounts. Full DOB is not in any
profile HTTP response or persisted Auth metadata. See [registration](registration.md).

RollCall now persists real UUID profiles and per-game experience in PostgreSQL. These
features use Fastify and the existing Supabase account session. Numeric demo users/events
remain separate; no UUID is converted into a mock actor. No persistent event, invitation,
administration or picture-upload feature is included.

## Run locally

Use the existing [authentication setup](authentication.md), public frontend Supabase
configuration and ignored backend environment. No new environment variables or packages
are required. From the repository root:

```powershell
pnpm.cmd install
pnpm.cmd db:start
pnpm.cmd exec supabase db push --local
pnpm.cmd dev:backend
# In another terminal:
pnpm.cmd dev
```

Keep the existing imported database; do not reset or reimport GeoNames. Open
`http://localhost:5173/register` or `/login`, confirm email through the local mailbox at
`http://127.0.0.1:55324`, then open `/profile`. The existing registration trigger already
creates one minimal profile per Auth UUID, including when email confirmation is enabled.
New accounts receive friendly completion guidance rather than a missing-profile error.

## Profile behavior

| Field                         | Behavior                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Display name                  | Required, trimmed 2–80 characters; control characters rejected                     |
| Biography                     | Optional, up to 500 characters; blank normalizes to null                           |
| Country                       | Optional, selected from enabled database countries                                 |
| City                          | Optional, confirmed backend suggestion belonging to the selected country           |
| Birth year                    | Optional integer from 1900 to the current year; private, self-declared, unverified |
| Age declaration               | Assigned by the server when birth year is supplied; cleared when it is removed     |
| Account/profile creation date | Read-only; stored when the registration initializer creates the profile            |
| UUID, role and timestamps     | Never client-editable                                                              |

Country-only profiles are valid. Changing country clears city; typed city text must be
cleared or confirmed before saving. No geographic IDs are invented. The picker reuses
geography controls through route composition, without users importing geography internals.
Profile details/private age save together; failed saves retain form values. No full birth
date is collected. Public views contain no account email, birth year, declaration timestamp,
roles or privileged Auth metadata.

`/profile` shows the signed-in account's details and a clearly private age section.
`/profile/edit` edits public details and private birth year, with a separate My games editor.
`/users/:userId` is public and accepts real UUIDs. Anonymous/demo visits to private profile
routes go to real login. The navbar links to Profile; Account settings remains accessible
from the own-profile page. Profiles use initials rather than new image storage.

## Games and API contract

My games uses `GET /api/games`, reading the existing database catalog. It does not assume
that a mock game ID equals a real catalog record. Existing event mock catalog APIs remain
unchanged. Experience is independently `beginner`, `intermediate` or `veteran` for each game.
Adding, updating and removing games edits a draft; Save changes commits the whole set.
Selected games disappear from add options; the composite database PK also prevents duplicates.
Public profiles show the chosen games and levels as self-declared, not verified. Experience
does not gate joining; event experience/tag rules are unchanged.

| Endpoint                                 | Access and result                                           |
| ---------------------------------------- | ----------------------------------------------------------- |
| `GET /api/me/profile`                    | Verified owner; `OwnProfile`                                |
| `PATCH /api/me/profile`                  | Verified owner; strict nonempty patch; updated `OwnProfile` |
| `GET /api/me/game-experience`            | Verified owner; `GameExperience[]`                          |
| `PUT /api/me/game-experience`            | Verified owner; `{ games, expected }`; atomic replacement or 409 |
| `PUT /api/me/game-experience/:gameId`    | Verified owner; `{ experience }`; saved association         |
| `DELETE /api/me/game-experience/:gameId` | Verified owner; idempotent 204 for a valid catalog game     |
| `GET /api/users/:userId`                 | Public-safe `PublicProfile`; missing profile returns 404    |
| `GET /api/games`                         | Public, read-only database `Game[]`                         |

Exact DTO fields, validation and error contracts are in [entities](entities.md). Own profile
responses are no-store; public profiles also avoid stale HTTP cache responses. Profile
queries are keyed by UUID. Logout/account changes clear private caches and cancel consumed
query signals. Private requests check the expected account before sending a bearer, and
own-profile responses must match it. Public data never reuses an own-profile response.

## Database and authorization

Additive migration `20261025000100_user_profiles.sql` changes access, not the existing
table layout or registration initializer. It grants public-safe profile/game/experience
reads and owner-only writes with RLS. Profile column privileges exclude UUID and timestamps;
roles and event locations remain unavailable. SQL checks enabled countries, the existing
composite city/country FK, valid game references, experience values and birth-year constraints.
Fastify validates the same API input rules with Zod and returns sanitized standard errors.

Each protected request uses the verified Supabase bearer in a newly created unprivileged
client. There is no shared mutable session or service-role bypass. SECURITY INVOKER functions
`public_profile`, `get_my_profile`, `update_my_profile`, `set_my_game_experience` and
`remove_my_game_experience` have hardened search paths and explicit execute grants.
Ownership derives from `auth.uid()`, never a JSON actor. Profile and private-age changes
run atomically; the caller's profile row is locked during the update.

The private schema stays unexposed by PostgREST. Narrow authenticated schema/table grants
allow the invoker functions to read/write only the owner's age row under RLS. They grant
no access to account roles or protected event locations. Public JSON is explicitly assembled;
it is not a privileged view over private tables. Direct Data API allow/deny tests cover the
same restrictions. See [schema](database-schema.md) and [architecture](backend-architecture.md).

## Focused verification

Run root typecheck/lint/build, backend/mock/geography tests, `pnpm test:profiles` and local SQL tests. The new
backend unit/adapter tests are `backend/tests/profiles.test.ts`; real local integration is
`backend/tests/integration/profiles.test.ts`; focused SQL is
`supabase/tests/database/profiles.test.sql`.
The focused frontend client checks cover account-switch write isolation, own-response UUID
validation and public-response projection without requiring running services.

With local services running, execute representative browser cases:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://localhost:5173'
$env:RUN_LOCAL_PROFILE_UI='true'
pnpm.cmd test:ui profiles-ui
```

This runs two scenarios in each 375px/1440px dark/light configuration. Temporary test
accounts are removed individually through the loopback maintenance connection in ignored
`backend/.env`. The tests never reset the database or call a remote project. Auth traces
are disabled for these scenarios so bearer headers/email links are not recorded. Screenshots
remain ignored; do not publish mailbox exports or unrelated session artifacts.

Executed results and remaining limits are recorded in [profile verification](profiles-verification.md).
Milestone 4 still owns persisted event/attendance APIs, explicit UUID event adapters and
separately reviewed eligibility/address policy. Account deletion/retention, avatars, real
invitations and administration remain future work.

Official references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security) and
[database functions](https://supabase.com/docs/guides/database/functions).

## Milestone 5B-1

Public and own profile contracts remain unchanged. Role fields remain non-editable through profiles. New permission/administrative projections are separate authenticated endpoints, not public profile fields; administrators gain no private age access. See [administration](administration.md).

## Milestone 5B-2B

Profile/experience modifications and private own-profile access require an active account, including direct RPC/table writes through RLS. Public-safe profile/catalog reads remain public. Suspensions do not delete profiles or game experience, and reinstatement does not change roles. See [enforcement](account-suspensions.md).

## Profile editor follow-up: executed verification

- Root typecheck, lint (including feature boundaries), build and `git diff --check` passed.
  The production build retains its existing non-blocking chunk-size advisory.
- Backend profile/Auth unit regression: 8 tests passed. Frontend profile client/date/
  identity checks: 5 tests passed, including UTC midnight boundaries and late account switches.
- New database-backed HTTP integration: 1 passed with two confirmed disposable Auth
  accounts. Covered add/change/remove, refresh/public projection, invalid catalog data,
  duplicates, atomic concurrent saves (one 200, one 409), contention with legacy writes,
  private DOB immutability, location consistency, cross-account Data API attempts and
  suspended old-token denial.
- SQL: new game-set file 24 assertions, existing profiles 42, existing suspensions 21;
  all 87 passed in rolled-back transactions. No security policy or validation trigger
  was disabled by these tests. All 21 migrations replayed on a fresh disposable project.
- `pnpm.cmd test:profile-editor-ui` passed with intercepted synthetic API/Auth responses
  at 375/1440 in light/dark themes. Checked keyboard tabs, tab URL Back/Forward, both
  drafts, Cancel without writes, no-op/duplicate controls, failed-save draft retention,
  save/reload/public updates, country/city, account-switch clearing, reduced motion,
  account date punctuation, no enabled deletion action and no horizontal overflow.
  Screenshots were inspected. This is browser/UI verification, not hosted persistence.
- Existing focused auth-experience and navigation/discovery browser suites passed across
  both sizes/themes. No unrelated full browser suite was run. The older opt-in
  `profiles-ui.spec.mjs` editor assertions were aligned with the new tabs/Save contract,
  but that entire legacy suite was not executed; its older registration/session fixtures
  need a separate update before relying on it for current Auth onboarding acceptance.

No hosted writes, account deletion, env changes or original database reset were performed.
The disposable project's resources are cleaned up; original local Supabase is preserved.
Historical migrations and existing event experience/tags logic are unchanged.

Manual acceptance after separately approved migration/backend/frontend rollout:

1. Edit Profile, switch tabs and use Back/Forward; drafts must survive tab history.
   Cancel each editor and verify saved data is unchanged.
2. Add/change/remove games, Save and refresh own/public profiles. In two sessions, save
   conflicting drafts; the second must retain its draft and offer explicit saved-set reload.
3. Verify country changes clear the city; confirmed cities save, free text does not.
   DOB-backed birth year remains read-only; private data must stay out of public responses.
4. Check 375/1440 light/dark, keyboard arrows/focus, reduced motion, shared primary Back buttons,
   and account date punctuation. Delete account must remain disabled and start no request.

Primary changed areas: users editor/form/draft/API/hooks, shared BackLink/account-date,
auth/profile/event return links, account information/settings, backend profile schemas/
repository/routes/types, migration 21 and focused SQL/API/browser tests. Deletion changes
are limited to the disabled Settings control and its separate design document.
