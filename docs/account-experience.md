# Account experience redesign

`/profile` (active owner) now reads the **public** profile endpoint and shares
`ProfileSummary` with `/users/:userId`. It does not fetch email, private age, roles or
audit records. Its owner actions lead directly to `/profile/edit` and `/account`.
Profile editing retains its existing guard and actual `/profile` return route.

`/account` restores/verifies the real UUID session, displays the owner's email and
groups account information, security and an informational Danger Zone. Active-account
status gates the private profile component; suspended users retain recovery/logout
without private profile requests. Existing own-profile DTOs provide creation date,
birth year and DOB presence. Full DOB remains unexposed. The later
[auth casing follow-up](auth-experience.md) adds a safe optional nullable username via
migration 18 and matching DTOs; settings and the shared public profile now show its
actual spelling when available, never an invented value derived from display name.

On one's own `/users/:userId`, navigation offers actual `/profile` and `/account`
destinations; another player's profile and anonymous views offer no owner controls.
These links are presentation only: existing authentication/suspension guards remain
on the private destination routes. UUID and numeric demo identities remain separate.

Every logout entry point uses `LogoutButton`, including navbar, account settings,
suspended screen and demo session. The native modal centers its title, description
and equal-width side-by-side actions: **Yes, log out** left, **No, stay** right.
Cancellation gets initial focus; Tab/Shift+Tab wrap inside, Escape/native close cancels
before submission, and focus returns to the trigger. Explicit confirmation calls the
existing real/demo mutation and cache cleanup. A synchronous submission lock and
shared mutation pending state block duplicates; during an acknowledged in-flight
request buttons/Escape are disabled, since cancellation cannot undo submitted logout.
Failures that preserve the local session leave the dialog open with safe actionable text
and allow retry/cancellation. Supabase Auth SDK 2.118 also clears the local session on
remote logout errors: a dismissible application-level notice survives the redirect and
explains that local logout happened but provider confirmation failed. Never restore a
session merely to display an error or claim remote revocation succeeded.
Changing accounts closes an old confirmation. No raw provider error is rendered.

Account deletion is not implemented or enabled. The separate
[deletion architecture proposal](account-deletion-design.md) documents dependencies,
privilege isolation, reauthentication, freeze/cleanup, audit retention and approval gates.

Focused verification uses synthetic sessions and intercepted API/Auth responses, never
hosted accounts or private environment files. `pnpm --filter frontend test:account-ui`
covers themes/viewports, privacy, owner/anonymous navigation, suspension, loading/error/
empty states, keyboard cancellation/focus, logout errors, pending deduplication and
successful logout/redirect. Use `$env:PLAYWRIGHT_CHANNEL='chrome'` for installed Chrome.
Screenshots stay under ignored `frontend/.tmp/account-review/`. These browser scenarios
do not replace hosted Auth/security acceptance or real PostgreSQL deletion tests.

Executed verification: the representative account browser scenario passed at 375px and
1440px in dark/light themes, with privacy, keyboard, guard and logout assertions;
profile API checks (3 tests), registration transport/error checks (1), suspension client
checks (4) and backend Auth/suspension unit checks (6) passed. No database tests or
hosted writes were needed or performed for these UI changes. Root typecheck, lint
(including feature boundaries), build and `git diff --check` passed. The production
frontend retains a non-blocking 500 kB chunk warning. Generated screenshots contain
synthetic fixtures; no unexpected browser console or page errors remained.
