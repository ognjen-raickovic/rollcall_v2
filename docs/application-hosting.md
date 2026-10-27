# Milestone 6B-1: application hosting preparation

This is a reviewed setup plan, not deployment approval. No Render/Vercel service or hosted
Supabase resource was created/changed during this work. Stay on the existing hosting feature
branch and review/approve the changes before committing, pushing or deploying.

The operator reports that 6A-2 applied all 16 migrations and initialized countries, games,
the reviewed GeoNames data and independent server keys using verified TLS. Auth email and
localhost redirects are configured. These are reported milestones, not new remote checks.
**6A-2 remains incomplete:** verified staging account/superadmin, hosted Auth/security
acceptance and custom SMTP are pending. See [database rollout](hosted-supabase-staging.md).

## Architecture and access gates

The subsequent username/DOB registration flow requires separately approved migration 17
and the existing backend operation capability. The reported hosted 16-migration baseline
does not yet support it. See [registration/startup](registration.md) for safe public-key
diagnostics and the dedicated local staging application configuration. This follow-up
does not complete any outstanding hosted security or email acceptance gate.

Browser -> Vercel HTTPS `/api/*` -> Render HTTPS `/api/*` -> Supabase Data API/Storage.
Browser -> Supabase HTTPS directly for the existing PKCE Auth flow only.
Vercel serves `frontend/dist`; Render runs the compiled Fastify server. Browser requests
stay on the frontend origin, preserving bearer headers, methods, query strings and multipart
uploads without browser CORS. Do not strip `/api` on the upstream. No proxy function, shared
gateway credential, service-role key or database connection is needed.

`vercel.json` orders health/API rewrites before the SPA fallback. `/api/health` maps to
Render `/health`; missing API endpoints must retain their API 404, not receive HTML.
External rewrites are uncached by default; API no-store headers remain explicit. Do not
enable rewrite caching for viewer-specific responses. [Vercel rewrites](https://vercel.com/docs/routing/rewrites).

Render's public hostname remains directly reachable when maintenance mode is disabled.
A rewrite is not origin authentication or a private network. All API authorization still
derives from verified Supabase bearer identity, live suspension state and existing RPC/RLS.
Keep `trustProxy: false`; do not trust arbitrary forwarded IPs or add broad CORS rules.

The Blueprint defaults to **paid Starter maintenance mode**, which returns 503 to public
traffic while the service runs. Automatic deploys are off. Review the cost before creating
anything. Do not substitute a free public service before acceptance; if paid maintenance
is unsuitable, postpone Render deployment until the security gates are complete.
[Render maintenance mode](https://render.com/docs/maintenance-mode).

Use Vercel Authentication and a protected **Preview** for initial hosting checks. Standard
Protection does not protect production domains; all-domain protection depends on the plan.
Do not run `vercel --prod`, attach a public production domain or share bypass links before
acceptance/approval. If protection cannot cover every URL you intend to create, do not deploy
that URL yet. Never assume a hard-to-guess URL is private.
[Deployment Protection scopes](https://vercel.com/docs/deployment-protection).

## Render setup (future manual actions)

Creating a Blueprint starts infrastructure/deployment; do not click Apply/Create until
explicitly authorized. The tracked configuration is `render.yaml` at repository root.

1. Review the exact commit and remaining security gates. Choose the repository and approved
   staging branch; keep automatic updates off. Render Blueprint sync itself is an operator
   action: do not apply future configuration changes automatically without review.
2. Use the following settings, already represented in the Blueprint:

   | Setting | Value |
   | --- | --- |
   | Service type/runtime | Web service / Node |
   | Root directory | Repository root (`.`), **not** `backend` |
   | Region/plan | Frankfurt / Starter (paid; review before creating) |
   | Build | `corepack pnpm install --frozen-lockfile --prod=false && corepack pnpm --filter backend build` |
   | Start | `corepack pnpm --filter backend start:production` |
   | Health path | `/health` (liveness only, not a database/security readiness check) |
   | Auto deploy | Off |
   | Maintenance mode | Enabled before serving any public traffic |

   Root context preserves the workspace manifest and shared lockfile; files outside a Render
   root are unavailable. Root `engines.node=22.x` selects Node 22; verify the actual supported
   patch in build logs. pnpm is pinned to `12.14.0` via `packageManager`; do not fall back to an
   unreviewed version if Corepack is unavailable. Dev dependencies are required for TypeScript
   during build. Only the backend is compiled; no migration/import/setup command runs.
   [Render monorepos](https://render.com/docs/monorepo-support),
   [Node version selection](https://render.com/docs/node-version).
3. Enter the Render environment variables below through the private Dashboard inputs. The
   `sync:false` entries deliberately contain no values. Do not upload secret files or mount
   operator directories. Use the existing provisioned server roots from the team's secure
   source; do not regenerate them. This task never reads those values.
4. Let Render supply `PORT`; the server reads it and binds `HOST=0.0.0.0`. Do not add a fixed
   port or replace the start command with Vite/tsx. `start:production` loads environment
   variables from the platform and does not load any `.env` file. Existing local commands
   remain unchanged. Fastify already handles SIGTERM/SIGINT shutdown.
5. After an authorized maintenance-mode deployment, check build/start logs without dumping
   environment variables. Confirm `/health` internally/with approved SSH tooling. Public
   HTTP should return Render's maintenance 503, not RollCall data. Do not disable maintenance
   merely to make a health smoke test convenient.
6. Record the actual Render HTTPS hostname. In `vercel.json`, replace all three instances of
   `https://rollcall-api.invalid` with that one reviewed origin, with no trailing path/query.
   Keep the three destination paths unchanged. The reserved `.invalid` placeholder cannot
   be used for a hosting build: the deployment guard refuses it. Never guess an available
   service hostname or point the proxy at a service you do not control.

## Vercel setup (future manual actions)

1. Use the **repository root** as the Vercel project root. Framework: Vite. Node: 22.x.
   `vercel.json` defines install `corepack pnpm install --frozen-lockfile`, build
   `pnpm build:hosting`, and output `frontend/dist`. Do not use `frontend` as Root Directory
   with these commands/config paths. No backend/functions are deployed by this static build.
2. Set `ENABLE_EXPERIMENTAL_COREPACK=1` and the four frontend variables below for the intended
   Preview environment. Add them separately to Production only when that environment is
   approved. Corepack respects the root pnpm pin.
   [Vercel package-manager setup](https://vercel.com/docs/builds/configure-a-build#corepack).
3. Avoid importing a Git project through an action that immediately publishes a production
   deployment. With the Vercel CLI, `vercel link` can create/link the project without deploying;
   configure Dashboard build settings, environment and Deployment Protection before the first
   deploy. Do not use `vercel env pull` in this task or overwrite ordinary local `.env` files.
4. Keep Git-triggered deployments disabled (`git.deploymentEnabled=false` in `vercel.json`).
   After explicit deployment approval, use `vercel` from repository root for a protected
   **Preview**, never `--prod` yet. `.vercelignore` excludes local env files, operator material,
   certificates, assistant configuration and generated data from CLI uploads. A local project
   link lives in ignored `.vercel/`; never commit it. Git deployments receive tracked source,
   so never force-add ignored files. Review `git status` before any future push.
5. Verify signed-out/unapproved visitors are blocked on every generated/aliased Preview URL.
   `pnpm build:hosting` deliberately refuses the placeholder API hostname, direct cross-origin
   browser API configuration, enabled demo mode, privileged Supabase keys and undocumented
   browser variables. Rebuild after changing public environment values; Vite embeds them.
6. While Render maintenance is enabled, `/api/*` will return maintenance 503. This is expected;
   no claim of working end-to-end hosting can be made yet. Complete 6A-2 with approved local
   clients/SSH and direct Data API/Storage checks first. Disabling Render maintenance and
   making the API reachable needs explicit security acceptance/approval. Keep the Vercel
   Preview protected while performing the final proxy smoke checks below.

## Environment placement

| Platform | Variable | Value/handling |
| --- | --- | --- |
| Vercel build | `VITE_SUPABASE_URL` | Hosted project HTTPS origin, public. |
| Vercel build | `VITE_SUPABASE_PUBLISHABLE_KEY` | Only publishable or legacy **anon** key, intentionally public. |
| Vercel build | `VITE_API_ORIGIN` | Empty/omitted: browser uses the Vercel origin. |
| Vercel build | `VITE_ENABLE_DEMO_MODE` | Exactly `false`; existing `import.meta.env.DEV` gate also disables demo identities in production. |
| Vercel build | `ENABLE_EXPERIMENTAL_COREPACK` | `1`; platform tooling, not browser configuration. |
| Render | `NODE_ENV`, `HOST`, `LOG_LEVEL` | `production`, `0.0.0.0`, `info` (Blueprint defaults). |
| Render | `PORT` | Render-provided port; do not hardcode. |
| Render | `SUPABASE_URL` | Same hosted HTTPS project origin, public configuration. |
| Render | `SUPABASE_PUBLISHABLE_KEY` | Same unprivileged publishable/anon key; backend validation rejects service-role/secret keys. |
| Render only | `EVENT_INVITATION_KEY` | Existing independent staging encryption root; secret, must match provisioning. |
| Render only | `EVENT_COVER_OPERATION_KEY` | Existing independent staging operation root; secret, must match database verification material. |
| Render optional | `SUPABASE_TIMEOUT_MS` | Existing default `5000` (allowed 100–30000). |
| Render optional | `CITY_SEARCH_DEFAULT_LIMIT`, `CITY_SEARCH_MAX_LIMIT` | Existing defaults `4`, `20`; default must not exceed maximum. |

No database URL/password, service-role key, CLI access token or `ROLLCALL_STAGING_*` operator
variable belongs on either host. Never use `VITE_*` for the two server roots. No shared env
group containing maintenance credentials should be attached. Keep ordinary local frontend/
backend `.env` files unchanged. `API_PROXY_TARGET` is only the local Vite development/preview
proxy; it does nothing to hosted Vercel routing. Vercel metadata variables are not authority.

Render receives the reviewed Git tree, which excludes private local material. Vercel publishes
only static assets, with no server env files; its CLI upload ignore file provides additional
protection. Never upload a repository ZIP or a local directory to Render. Do not mount a
secret file, `.staging` folder, database dump or downloaded geography dataset on either host.

## Acceptance and release gates

Before opening staging, finish and record the remaining **6A-2** checks:

- Register/confirm an intended staging account and verify profile initialization, login,
  logout, restoration and recovery. Review and provision a deliberate superadmin through
  the approved operator workflow, not the first user automatically. No account was created here.
- Configure/test custom SMTP for general testers, with sender/domain verification and abuse
  limits. Default Supabase email restrictions are not general-user delivery verification.
- Test live hosted RPC/RLS authorization, cross-user privacy, roles, suspension/reinstatement,
  old JWT rejection, immutable audits, event capacity races, private code rate limits and
  Storage reservations/signing/access. Reuse the database rollout acceptance checklist;
  do not repoint destructive/local fixture runners at hosted data.
- Set the actual approved frontend Site URL and exact `/auth/callback` and `/reset-password`
  redirect URLs. Keep email confirmation enabled; no wildcard Preview domains. Use one stable
  approved protected Preview origin for Auth testing, then explicitly review any production
  origin change. Localhost redirects need not be removed merely to test the protected Preview.

After approval to make Render reachable, disable maintenance deliberately and test the protected
Preview: homepage/discovery, direct event-detail and Auth route refreshes, authenticated profile
save, event mutations and multipart cover upload. Verify upstream bearer/query/body forwarding,
API JSON 401/403/404 behavior, no-store headers, private address/cover boundaries and absence of
browser CORS errors. Check unauthenticated visitors still cannot load the protected Preview.
Do not bypass Deployment Protection via shared links to make callbacks pass.

Public/general-tester access, production aliases and automatic deploys remain separate explicit
release decisions after those checks. If a security check fails, retain/re-enable maintenance,
leave frontend protection on and investigate; never weaken RLS/Auth or switch to service-role.
Health checks only prove process liveness. A rollback of app code must preserve compatibility
with the current database; do not reset/replay migrations or rotate established roots.

## Local verification

From repository root, without loading private operator configuration:

```powershell
pnpm.cmd hosting:check
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd test:hosting
```

`hosting:check` validates the preparation template; `build:hosting` is the stricter deployment
gate and requires real public build settings and the reviewed Render destination. The focused
tests use synthetic public values/local HTTP services, check compiled API liveness/401,
and exercise Vite production-preview SPA/API routing with bearer/multipart requests. They do
not connect to hosted Supabase or prove Vercel CDN/Render protection behavior. Actual hosted
proxy, Auth/SMTP, TLS, platform limits, native Sharp Linux install and protected-preview
journeys remain deployment-time acceptance checks, not claims of this milestone.

Verified locally on 2026-10-27: root typecheck/lint/build and `hosting:check` passed; all four
`test:hosting` scenarios passed; both backend environment validation tests passed, including
privileged-key rejection. The local tests used compiled output and synthetic public settings,
not hosted accounts/credentials. The strict deployment guard rejects the current `.invalid`
template as intended. No Vercel/Render deployment, remote acceptance test or Blueprint API
validation was executed. No files under the private staging operator directory were opened.
