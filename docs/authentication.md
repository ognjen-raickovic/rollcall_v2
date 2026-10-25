# Real authentication: Milestone 3A

RollCall uses local Supabase Auth for real email/password accounts. Registration, login,
logout, email confirmation/resend, password recovery and reset are implemented. The SDK
owns PKCE exchange, session persistence and automatic token refresh. Fastify independently
verifies bearer identity for `GET /api/me`. Event CRUD/attendance and public user/game
catalogs are still mocks; signing in does not create a persistent event profile workflow.

## Local setup

Use Node.js 22.12+, the pinned pnpm version and Docker Desktop. Run from the repository root:

```bash
pnpm install
pnpm db:start
pnpm exec supabase db push --local
pnpm exec supabase status
```

Use the local status values privately to configure ignored environment files. Do not paste
full status output into issues/screenshots; it may include privileged keys. Apply migrations
additively; do not reset the populated geography database to start authentication.

Copy `backend/.env.example` to `backend/.env` and configure:

```dotenv
SUPABASE_URL=http://127.0.0.1:55321
SUPABASE_PUBLISHABLE_KEY=<local publishable or legacy anon key>
```

Copy `frontend/.env.example` to `frontend/.env` and configure the same project's public values
(an ignored `frontend/.env.local` is also supported and takes precedence):

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:55321
VITE_SUPABASE_PUBLISHABLE_KEY=<local publishable or legacy anon key>
VITE_ENABLE_DEMO_MODE=false
```

Publishable/anon keys are designed for public clients; secret/service-role keys, database
passwords, signing secrets and management access tokens must never appear in `VITE_*`.
The browser client is for Auth only, not direct application-table access. Never point local
tests at a remote project. Restart Vite after changing its environment.

In separate terminals:

```bash
pnpm dev:backend
```

```bash
pnpm dev
```

Open `http://localhost:5173`. Fastify defaults to `http://127.0.0.1:3001`; Vite proxies
`/api` in development/preview. `API_PROXY_TARGET` optionally changes the proxy target;
`VITE_API_ORIGIN` optionally specifies a browser API origin and otherwise stays same-origin.
Cross-origin production hosting requires a separately configured CORS policy and is not
deployed here. The app still builds with services stopped; unavailable Auth/geography
shows useful configuration/network feedback rather than pretending a session exists.

On PowerShell with blocked shims, use `pnpm.cmd`. Local Supabase ports are API 55321,
PostgreSQL 55322, Studio 55323 and mail UI 55324. Stop application servers with Ctrl+C;
`pnpm db:stop` stops the local stack. Do not use destructive reset/no-backup flags to
refresh configuration. Existing partial stacks may require repairing/restarting the local
mail service; verify mail availability instead of treating a running database as proof.

## Routes and email flows

| Route              | Behavior                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `/register`        | Email, password and confirmation; success either signs in or explains email confirmation           |
| `/login`           | Email/password sign-in, safe errors, registration/recovery and optional development-demo links     |
| `/forgot-password` | Requests a reset email with neutral account-existence feedback                                     |
| `/reset-password`  | Recovery-session password/confirmation; completing reset ends the local session for explicit login |
| `/auth/callback`   | PKCE confirmation callback and session feedback                                                    |
| `/account`         | Minimal account summary and server-verified identity; no profile editing                           |
| `/demo/login`      | Numeric fixture selection only in explicitly enabled Vite development mode                         |

Local email confirmation is enabled in `supabase/config.toml`. Register, open Mailpit at
`http://127.0.0.1:55324`, find the confirmation message and follow its link. For reset,
request recovery from `/forgot-password`, open its email, follow the recovery link and set
a new password. Do not put email links, codes, passwords or bearer tokens into logs,
screenshots or committed fixtures. Links are time-limited and one-use; request another
confirmation/recovery link when necessary.

PKCE requires the verifier retained by the browser that initiated the request. Open links
in the same browser and exact frontend origin: `localhost` and `127.0.0.1` have separate
storage. Supabase allows exact `/auth/callback` and `/reset-password` paths on both loopback
hosts at ports 5173 and 4173. Keep callback allowlists narrow; no wildcard external redirects.
The SDK exchanges the code, removes callback credentials from the URL and restores the session.
Duplicate registration may return either a safe error or neutral confirmation feedback,
depending on Supabase's anti-enumeration behavior; success text never proves an account is new.

Passwords are validated in the form, passed only to Supabase Auth and never stored in
application tables. Registration/reset require matching confirmation and 8–72 characters;
Supabase can enforce additional password policy. Invalid credentials, unconfirmed email,
expired links, rate limiting and unavailable services have controlled user-facing errors.
Session data uses the SDK's browser storage and refresh mechanisms. Real account storage is
independent of `rollcall.theme` and the tab-scoped numeric demo selection.

## Backend identity and security boundary

`GET /api/me` requires `Authorization: Bearer <Supabase access token>`. The reusable
Fastify guard verifies the signature using supported `getClaims`: asymmetric signing uses
the Auth JWKS and symmetric signing uses Auth-server verification. The server additionally
validates configured issuer, authenticated audience, expiry and UUID subject. It attaches
identity to the current request, never a process-wide current user.

Success is `{ id: string (UUID), email: string | null }`, without an envelope, with
`Cache-Control: no-store`. Missing, expired, malformed or invalid tokens return 401
`{ code: 'UNAUTHENTICATED', message, fields: {} }`. No tokens, passwords, roles, private
metadata or addresses are included. Geography remains public. Backend logs redact sensitive
headers and omit sensitive payloads; the API uses no service-role key or privileged session.

Do not derive authority from a submitted actor ID, arbitrary decoded JWT, editable metadata
or a selected demo profile. `getSession` is useful for obtaining the browser's current
access token, not proof of server authorization. Future protected data operations must use
verified identity plus request-isolated user context and focused RLS/grants.

Logout removes the local session and revokes its refresh capability. An already-issued
access JWT can remain valid until expiration; `/api/me` is stateless token verification,
not an immediate per-token revocation list. Broader device/session management is not part
of this milestone. Browser token storage also requires ordinary XSS prevention; no claim
of production hardening or deployment is made.

## Minimal profile initialization

Migration `20261024000400_auth_profile_initialization.sql` adds a narrow private trigger
on `auth.users`. It inserts the Auth UUID and fixed `RollCall player` display name, leaving
geography/biography unset. Missing existing profiles are backfilled without overwriting
existing rows. Email and editable metadata are not copied; no private age or account role
is initialized. The SECURITY DEFINER function has an empty search path and no API-role
execute grants. Profile/event tables retain RLS and deny-by-default grants.

No profile editing, public profile endpoint, per-game experience flow, role management,
private room code or persistent event API is added. Minimal initialization satisfies
the current profile constraints without prematurely implementing onboarding.

## Real UUIDs and legacy numeric demo identities

The users feature's real `Account` has UUID `id` and nullable email. Legacy public `User`
and event actor IDs remain numbers. There is no automatic mapping, numeric coercion or
impersonation adapter between them. A real signed-in user can browse public mock events
but does not inherit a fixture's host/attendee access or gain persistent participation.

For development workshops only, set `VITE_ENABLE_DEMO_MODE=true`, restart Vite and use
`/demo/login`. Both the explicit flag and `import.meta.env.DEV` are required. The demo
interface is labeled, uses the original mock profile/session APIs, and stores only its
selected numeric profile ID in sessionStorage. Production builds cannot select demo
profiles even when built with the flag set. Real login and demo selection are separate
journeys; event writes continue to receive an explicit numeric mock actor through routes.
Mock tests remain independent of a running Auth server.

Milestone 3B will add profile onboarding/editing and self-declared per-game experience
with focused self-access policies. Milestone 4 will introduce persistent event/attendance
APIs, explicit UUID frontend adapters and verified host/member authorization, replacing
numeric demo dependencies. Exact addresses must then be omitted from unauthorized server
responses; hiding a field in a mock UI is not a privacy boundary.

## Verification commands and official references

Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:mock`, `pnpm test:geography`,
`pnpm test:backend`, `pnpm db:lint` and `pnpm db:test`. With the local services configured,
opt in to database-backed tests using `RUN_LOCAL_INTEGRATION=true pnpm test:integration`
(PowerShell: set `$env:RUN_LOCAL_INTEGRATION='true'` first). `pnpm test:ui` requires the
configured local servers/browser and explicit demo opt-in for legacy event journeys.
Distinguish executed integration/browser checks from stubs or prepared SQL in reports.

For all browser journeys, also opt in to real local email testing. The browser suite uses
random temporary accounts, follows Mailpit links and deletes only those test accounts using
the loopback maintenance database connection from ignored `backend/.env`:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://localhost:5173'
$env:RUN_LOCAL_AUTH_UI='true'
pnpm.cmd test:ui
```

Keep `VITE_ENABLE_DEMO_MODE=true` in local frontend configuration for the legacy event
journeys. With `RUN_LOCAL_AUTH_UI` absent, the real-account browser journeys are explicitly
skipped, rather than counted as passing. Do not publish browser traces or mailbox exports;
they may contain temporary credentials and one-use links. Generated artifacts are ignored.

- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Supabase JavaScript getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims)
- [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts)
- [Supabase password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Supabase Auth redirects](https://supabase.com/docs/guides/auth/redirect-urls)
