# Centered authentication and username casing

## Implementation

AuthShell now uses a centered 448px maximum-width column: small brand icon, centered
heading/help and one bordered form/status card. The subsequent navigation follow-up
moves return navigation to the content container's top-left while keeping the card
centered. Fields remain
left aligned. Compact vertical spacing and normal document scrolling support short
mobile screens. There is no desktop sidebar, promotional paragraph, fixed-height form
or new palette. Registration, login, callback, recovery and reset share this shell.
Callback loading/success/failure use centered icons, safe copy and clear navigation.
The existing SDK PKCE/session/recovery logic is unchanged. Five auth route boundaries
now provide a styled safe fallback instead of exposing default router error details;
ordinary form/provider failures remain inline. Conditional confirmation resend remains.

The capitalization loss came from `.toLowerCase()` in both registration Zod schemas
and `lower(btrim(p_username))` in migration 17's preparation function. The initializer
then copied that normalized value into both username and initial display name.

Forward migration `20261027000200_username_casing.sql` (18) keeps one spelling field:
`profiles.username` and its pending intent preserve validated casing. ASCII letters,
digits/underscores, a leading letter, 3–24 characters and surrounding trimming remain.
The existing unique `lower(profiles.username)` index is retained. Pending intents now
also have a unique `lower(username)` index; all reservation lookups/retries compare
case-insensitively under the existing registration advisory lock. There is no second
display/canonical column that can drift. Direct SQL uniqueness protects both tables
independently of endpoint prechecks.

Only the preparation function and safe public projection change. The initializer
already copies intent spelling without transforming it, so Auth/DOB triggers need no
replacement. RLS, grants, function ownership/search paths, capability checks, durable
rate counters and expiry remain intact. Public/own profile DTOs add optional nullable
`username` for staggered rollout; UI shows `@username` separately from editable display
name and in private settings when present. No private Auth metadata/DOB is added.

## Existing accounts

No values are rewritten. Existing lowercase usernames and pending migration-17 tickets
remain usable, and pre-registration accounts may still have null usernames. Their
original spelling cannot be recovered reliably. Owners can edit **display name** at
`/profile/edit` today; it does not rename or recase their immutable `@username`.
Self-service handle recasing is not implemented. A future case-only owner RPC would
need to require unchanged `lower(username)`, current verified ownership/active status,
registration/account lock ordering and uniqueness checks; never expose arbitrary direct
username UPDATE grants or pretend the current profile PATCH supports it.

## Rollout: instructions only, not executed on hosted Supabase

The operator reports migration 17 is applied locally and hosted. This session did not
inspect or modify hosted schema. Migration 17 and all earlier files remain unchanged.
Migration 18 was executed only in a separate disposable local Supabase.

1. Review migration 18, backup/recovery readiness and target identity under the existing
   [staging safeguards](hosted-supabase-staging.md). Briefly pause/drain registration
   across old instances during the transition; keep application hosting/access gates.
   Do not reset a database, reapply migration 17 or run rollback SQL.
2. The operator can inspect the already linked target and pending plan:

   ```powershell
   pnpm.cmd exec supabase migration list --linked
   pnpm.cmd exec supabase db push --linked --dry-run
   ```

   Expect migration 18 only when the remote has 1–17. Stop and review any unexpected
   migration/history/target mismatch. These commands are instructions, not checks
   performed by this task. Do not bypass project-identification safeguards.
3. **Only after explicit deployment approval**, the operator applies:

   ```powershell
   pnpm.cmd exec supabase db push --linked
   ```

   Database first: new clients against SQL 17 would still lose casing. Existing clients
   remain functional against SQL 18, but still send lowercase until updated.
4. Update all backend instances next (case-preserving validation, safe optional username
   DTO), then rebuild/release the frontend. Avoid serving new registration UI through
   an old backend that would silently lowercase it. Preserve hosting maintenance and
   acceptance gates; this document does not authorize a deployment. Confirm PostgREST
   schema reload and release paused registration only after the full path is aligned.
5. Manually verify a fresh mixed-case signup, lowercase/uppercase duplicate rejection,
   email confirmation/PKCE, recovery and displayed handle in own/public profiles/settings.
   Existing lowercase accounts must still log in normally. Verify public responses have
   no private age/email. Existing hosted security/SMTP acceptance remains outstanding.

If software must roll back, retain the forward schema and review the older client's
lowercasing behavior; do not rewrite existing mixed-case identities or migration history.

## Verification boundaries

The disposable upgrade begins with migrations 1–17, creates a synthetic lowercase
account and a pending ticket under SQL 17, then applies 18 without a reset. Assertions
verify unchanged legacy spelling/DOB, old ticket consumption and duplicate detection.
Real local Auth/profile integration verifies mixed-case spelling through API responses,
confirmation, concurrent case-variant attempts and existing recovery/ownership behavior.
SQL registration/casing tests exercise index enforcement, format, same-email retries,
expiry/replay/email binding, private DOB, metadata stripping, ACLs and active-account RLS.

`pnpm --filter frontend test:auth-experience-ui` uses intercepted synthetic Auth/API
responses, including the installed SDK's callback code exchange. It checks all five
pages at 375/1440px in both themes, loading/errors, callback success/failure, registration
spelling, private-data omission, recovery/reset, keyboard order and short-screen scrolling.
It is not a hosted email-delivery test. Screenshots are ignored under
`frontend/.tmp/auth-experience/`; installed Chrome can be selected with
`$env:PLAYWRIGHT_CHANNEL='chrome'`. No private staging files or credentials are accessed.

Executed results: 477 pgTAP assertions across 15 SQL files; the migration-17-to-18
upgrade assertions; three real local Auth/profile/registration integration scenarios;
10 focused backend unit checks; frontend registration transport (1) and profile
projection/isolation checks (3); and the representative auth browser scenario passed.
Root typecheck, lint (including feature boundaries), build and `git diff --check` pass.
The existing >500 kB frontend chunk advisory remains non-blocking. Disposable Supabase
resources were removed; the original running local stack was left intact. No hosted
email delivery, remote migration or hosted acceptance was performed.

## Changed UI files

All component paths below are under `frontend/src/features/users/components/`:

- `auth-shell.tsx`: shared centered header/card/return link; removes sidebar/promotion.
- `register-form.tsx`, `login-form.tsx`: compact vertical forms, concise copy, centered
  secondary links; registration trims and preserves casing.
- `auth-callback.tsx`: centered progress/success/failure presentation; existing state
  decisions and SDK handling stay unchanged.
- `password-recovery-form.tsx`, `reset-password-form.tsx`: same shell/rhythm and clear
  recovery/invalid-link states.
- New `auth-error.tsx` and `frontend/src/app/router.tsx`: safe auth-route fallback.
- `profile-summary.tsx`, `account-information.tsx`: actual `@username` in shared
  public/own profile presentation and private settings, separate from display name.

Contracts change in backend Auth validation, backend/frontend profile schemas and
frontend users types. Migration 18, registration/casing SQL tests, focused registration
tests and the new `check-auth-experience-ui.mjs` cover the behavior; related guides and
assistant instructions describe the same case-preserving contract.
