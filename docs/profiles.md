# Milestone 3B: real profiles and per-game experience

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
Adding, updating and removing games saves immediately, separately from Save profile.
Selected games disappear from add options; the composite database PK also prevents duplicates.
Public profiles show the chosen games and levels as self-declared, not verified. Experience
does not gate joining; event experience/tag rules are unchanged.

| Endpoint                                 | Access and result                                           |
| ---------------------------------------- | ----------------------------------------------------------- |
| `GET /api/me/profile`                    | Verified owner; `OwnProfile`                                |
| `PATCH /api/me/profile`                  | Verified owner; strict nonempty patch; updated `OwnProfile` |
| `GET /api/me/game-experience`            | Verified owner; `GameExperience[]`                          |
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
