# Registration, Auth diagnostics and application startup

## Established 401 cause

The reported hosted signup returned HTTP 401 and `Sb-Error-Code:
UNAUTHORIZED_INVALID_API_KEY`. This establishes rejection of the frontend API key
at Supabase's gateway, rather than a Fastify authorization failure. It does not
establish an SMTP problem or identify which old environment file supplied that key.
No hosted signup, credential replacement or remote configuration change was performed.

Copy the project URL and **publishable** key from the same project's Dashboard into
the appropriate private application configuration. Never use a secret/service-role key.
An opaque `sb_publishable_` prefix validates format only, not project membership.
Legacy anon JWT configuration also checks its project reference; this is not JWT
signature verification. The staging launcher performs one read-only Auth settings
request before starting either service, and stops on rejection.

Vite precedence, highest first: existing process environment, `.env.[mode].local`,
`.env.[mode]`, `.env.local`, `.env`. Development and production can therefore differ.
Restart Vite after configuration edits; rebuild before using preview or deployed assets.
Hard-refresh the browser and stop an old server if it serves a stale build.

```powershell
pnpm.cmd auth:diagnose
# Optional development-mode comparison:
node scripts/auth-diagnose.mjs development
```

The diagnostic prints only public project host, format/override booleans and build
comparisons; never key strings or fingerprints. Comparisons concern the current
files/build, not the historical failed request. In DevTools inspect only the signup
response status, `Sb-Error-Code`, and JSON `code`/`error_code`. Do not share request
headers, HAR exports, copied curl commands, passwords, tokens or raw response payloads.
Auth UI messages are allowlisted and redact unknown upstream details. A generic 401
does not invent a specific cause. Confirmation, rate-limit and provider errors have
separate messages. See [Supabase error codes](https://supabase.com/docs/guides/auth/debugging/error-codes)
and [API keys](https://supabase.com/docs/guides/api/api-keys).

## Hosted new-email delivery checklist

Registration accepts previously unregistered valid email addresses; neither the form,
registration-intent endpoint nor ticket claim restricts recipients to a team or email
domain. The latest reported failure has no supplied HTTP/error code yet, so its cause
is unconfirmed. The earlier invalid-key incident above is a separate diagnosis.

Supabase's default SMTP only delivers to organization-team addresses and currently
limits sending to two messages/hour. If custom SMTP is not configured, this is the
leading explanation for a new non-team recipient failing. Custom SMTP is required
for general email registration with confirmation; do not add users to the project
team merely to let them register. See the [official SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).

Manual setup in the **rollcall-dev** Dashboard (not performed by application code):

1. Choose an SMTP provider and verify a sender/domain you control. Complete its
   required DNS verification (including SPF/DKIM and an appropriate DMARC record),
   and clear any provider sandbox/recipient restrictions. The public support Gmail
   address is not automatically an authorized sender for a third-party SMTP service.
2. Under **Authentication > Email > SMTP Settings** (or Authentication's **Custom
   SMTP** settings), enable custom SMTP. Enter the verified sender address, sender
   name **RollCall**, and the provider's SMTP host, TLS port, username and SMTP
   password. Save credentials only in Supabase's private settings, never Vite, Git
   or a report. Use the provider's documented TLS settings.
3. Under **Authentication > Sign In / Providers > Email**, keep Email enabled,
   new-user signup enabled, and **Confirm email** enabled. Check **Authentication >
   Rate Limits** against the provider's limits without removing abuse protections.
4. Under **Authentication > URL Configuration**, set Site URL to
   `https://rollcall-v2.vercel.app`. Allow
   `https://rollcall-v2.vercel.app/auth/callback` and
   `https://rollcall-v2.vercel.app/reset-password`. Signup can append a safe
   `?returnTo=...` to the callback; if needed, allow the narrowly scoped pattern
   `https://rollcall-v2.vercel.app/auth/callback?**` as well. Keep localhost callbacks
   only for intentional development, and do not allow arbitrary Vercel domains.
   See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
5. Check **Authentication > Email > Templates**: confirmation/recovery links should
   retain Supabase's `{{ .ConfirmationURL }}` verification link, not a hardcoded
   localhost link or a direct link skipping verification. Disable provider link
   tracking if it rewrites or pre-consumes authentication links.
6. Manually register one owned non-team address with an unused username, then open
   the email in the requesting browser, confirm, log in, and check profile creation.
   Also test recovery. Do not share emailed links or tokens in diagnostics.

If it still fails, inspect only statuses and sanitized `code`/`error_code` values:

| Failing stage | Evidence | Next check |
| --- | --- | --- |
| Registration intent | 503 `DEPENDENCY_UNAVAILABLE` | Backend operation capability, matching provisioned fingerprint, migrations and RPC grants |
| Registration intent | 409 `CONFLICT` / 429 `RATE_LIMITED` | Choose a new username / wait for the attempt window; preserve durable limits |
| Supabase signup | `email_address_not_authorized` | Default SMTP team restriction or provider recipient restrictions |
| Supabase signup | `over_email_send_rate_limit` | Supabase email limits and provider quota |
| Supabase signup | 401 / `UNAUTHORIZED_INVALID_API_KEY` | Matching project/key and deployed build configuration |
| Supabase signup | `signup_disabled` / `email_provider_disabled` | Email provider and signup switches |
| Supabase signup | `unexpected_failure` | Auth logs and ticket/profile triggers; never expose raw database details |
| Confirmation delivered, wrong destination | Redirect mismatch | Site URL, callback allowlist and email template |

Existing allowlisted UI errors already distinguish team-only delivery, confirmation,
rate limits and provider failures. No error-handling or security bypass is needed for
the SMTP restriction. Hosted SMTP, redirect settings and the latest failure remain
unverified until the operator supplies evidence; local tests cannot verify them.

## New registration contract

The operator reports migration 17 (`20261027000100_registration_identity.sql`) is
already applied locally and hosted. Its private registration/DOB contract is preserved.
Forward migration 18 (`20261027000200_username_casing.sql`) adds case preservation;
it is tested locally only and requires separate hosted approval. No historical
migration is changed. Nullable legacy usernames and optional legacy birth-year
declarations remain; no fabricated DOB backfill occurs.

The form order is Username, Email, Date of birth, Password, Confirm password.
Username preserves validated ASCII casing, 3–24 characters, starts with a letter and
then allows letters, digits and underscores. A database unique index and serialized
reservation/claim path enforce global case-insensitive uniqueness using `lower(username)`.
Existing lowercase values are unchanged. Username is immutable
through ordinary profile editing; display name remains independently editable.

`POST /api/auth/registration-intent` accepts strictly `{username,email,dateOfBirth}`,
never password, role or account ID. DOB must be an actual calendar date from 1900
through today (the existing private age storage bound, not an event eligibility rule).
The backend uses its unprivileged key plus the existing backend-only operation
capability, shared with covers/invitations; no new key generation or service role.
Missing runtime capability/migration fails closed with a sanitized 503.

The private reservation contains an email hash and DOB and expires after ten minutes.
The browser sends only its opaque ticket to Supabase Auth metadata. Auth INSERT claims
the ticket atomically and initializes the profile/private DOB before email confirmation.
The consumed ticket is deleted. INSERT and metadata UPDATE triggers remove DOB fields
and tickets from persisted Auth metadata, so these fields do not enter later JWTs.
Auth can echo the consumed opaque ticket in the initial signup response; it is not a
DOB disclosure or reusable capability. Confirmation and PKCE behavior stay enabled.
Direct signup without preparation fails; Dashboard/admin-created users and other
identity providers need a separately designed onboarding path.

Full DOB stays in `private.profile_private.date_of_birth`, protected by owner-only RLS
and explicit grants; anonymous and other accounts cannot read it. Public profiles omit
age/email. Ordinary own-profile responses expose only birth year and `hasDateOfBirth`,
not full DOB. Registration DOB is immutable through profile editing and its derived
birth year cannot be contradicted. Legacy users retain optional birth-year editing.
No experience or age-based event admission rule is introduced.

Abuse controls persist at most 20 preparation attempts per 15 minutes per HMAC-IP
fingerprint. Fastify does not trust caller forwarding headers. Behind a reverse proxy,
clients can share the peer-IP budget; review
explicit trusted-proxy/rate-limit design before broad rollout rather than trusting
arbitrary forwarding headers. Negative outcomes commit
their counters. Private tables have RLS and no client/service-role grants. Pending
reservations and counters are bounded (1,000/10,000); expired entries are removed in
bounded batches on subsequent preparation, not by a guaranteed scheduled erasure job.
There is no dedicated retention scheduler in this milestone. Unconfirmed accounts
hold their username until approved account cleanup, just like other account identities.

## One-command application startup

Local application, using ordinary local-only frontend/backend environment configuration:

```powershell
pnpm.cmd dev:all
```

Start your existing local Supabase separately when needed; this command neither starts
Docker nor resets any database. It refuses hosted values in local mode. `pnpm dev`
and `pnpm dev:backend` remain available individually.

For local application code against approved hosted staging, prepare **only** this
dedicated ignored file yourself (the example contains no credentials):

```powershell
Copy-Item .env.staging-app.example .env.staging-app
# Fill the dedicated file privately, then:
pnpm.cmd staging:smoke
```

Fields are `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, optional
`FRONTEND_PORT`/`BACKEND_PORT`, and approved existing backend runtime capability keys
`EVENT_COVER_OPERATION_KEY` / `EVENT_INVITATION_KEY`. Registration requires the former;
invitations require both. Obtain approved runtime values privately; never copy an operator
file, database URL or privileged Supabase key. The launcher rejects unsupported fields,
reads no `backend/.staging/` files and does not load the ordinary backend `.env` in this mode.
Backend capabilities are passed only to Fastify; Vite receives public values and a
loopback API proxy target. Demo mode is off. This is a local development server, not
an application deployment or permission to perform writes.

Both services have prefixed output, loopback bindings, strict ports and coordinated
shutdown. Ctrl+C terminates both process trees on Windows. Port conflicts stop startup
with a clear message. The staging launcher needs no local Docker, creates no accounts,
applies no migrations, provisions no keys and makes only its read-only Auth key probe.

## Verification and remaining hosted gates

Executed against an isolated disposable local Supabase, not the original developer
database or hosted staging: real registration, confirmation, login, restoration,
recovery, logout, profile ownership/privacy and concurrent username reservation checks.
SQL coverage includes ticket capability/expiry/replay/email binding, durable rate counters,
private DOB, metadata rewrites, role restrictions and existing attendance/Storage policies.
Legacy domain fixtures explicitly emulate pre-onboarding accounts inside test-only
maintenance/rolled-back transactions; production triggers and policies stay enabled.

Browser checks use intercepted synthetic responses: field order, duplicate username,
contextual confirmation resend, callback state and 375/1440 layouts in both themes.
These are not hosted email-delivery or real browser PKCE acceptance. Existing recovery
integration uses real local Auth. Startup tests launch/stop both real local processes
with synthetic configuration and test port conflicts, environment separation and a
mocked read-only key probe. Run `pnpm test:registration`, `pnpm test:app-startup` and
`pnpm --filter frontend test:registration-ui` (local Chrome may require
`$env:PLAYWRIGHT_CHANNEL='chrome'`). Do not run integration commands against hosted data.

Executed results: 460 SQL assertions across 14 files; three real local Auth/profile/
registration integration scenarios; nine focused backend unit checks; one frontend
transport/error scenario; four startup checks; four hosting checks; and the representative
browser scenario above. Typecheck, lint (including feature boundaries and new root
scripts), and production builds pass. The frontend has a non-blocking 500 kB chunk warning.
Windows process tests require execution outside this session's restricted sandbox;
they passed with that access. Disposable Docker resources were removed; original data
and the mail backup were preserved. No hosted checks or registrations were attempted.

Before enabling case-preserving hosted registration: review/apply migration 18 only
with approval, following [database/backend/frontend ordering](auth-experience.md), and verify the correct
public project/key pairing and approved backend capability, then manually verify email
confirmation/PKCE/recovery in the intended browser. Custom SMTP remains necessary for
broader/non-team email testing; an invalid API key is not evidence of SMTP failure.
All remaining [6A-2 security acceptance gates](hosted-supabase-staging.md) still apply.
Keep hosted application access restricted until those gates are verified.
