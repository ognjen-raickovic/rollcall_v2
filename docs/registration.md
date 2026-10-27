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

## New registration contract

Apply the separately reviewed additive migration
`20261027000100_registration_identity.sql` before enabling this registration UI.
The previously deployed 16 migrations do not implement this contract. No historical
migration is changed. Existing accounts remain usable, with nullable legacy usernames
and optional birth-year declarations; no fabricated DOB backfill occurs.

The form order is Username, Email, Date of birth, Password, Confirm password.
Username is canonical lowercase ASCII, 3–24 characters, starts with a letter and
then allows letters, digits and underscores. A database unique index and serialized
reservation/claim path enforce global case-insensitive uniqueness. Username is immutable
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

Before hosted use: review/apply migration 17 only with approval, configure the correct
public project/key pairing and approved backend capability, then manually verify email
confirmation/PKCE/recovery in the intended browser. Custom SMTP remains necessary for
broader/non-team email testing; an invalid API key is not evidence of SMTP failure.
All remaining [6A-2 security acceptance gates](hosted-supabase-staging.md) still apply.
Keep hosted application access restricted until those gates are verified.
