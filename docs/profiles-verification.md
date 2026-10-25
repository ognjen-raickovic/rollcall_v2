# Milestone 3B verification

Verified on 25 October 2026 on `feat/user-profiles`, using the existing local Supabase
database/Auth/mail stack, Fastify, Vite and installed Chrome. No branch change, staging,
commit, push, merge, deployment, remote Supabase operation, database reset or GeoNames import
was performed. Credentials and authentication tokens were not printed in diagnostics.

## Delivered files and boundary

New backend module: `backend/src/modules/profiles/` contains response/input schemas, types,
routes and data access. `app.ts` registers it; the narrow database types and client helper
support isolated bearer-scoped calls. New tests are `backend/tests/profiles.test.ts` and
`backend/tests/integration/profiles.test.ts`.

New database migration: `20261025000100_user_profiles.sql`. It adds focused grants/RLS,
enabled-country validation and SECURITY INVOKER functions for public/own profile reads,
atomic profile/private-age updates and experience mutations. It preserves existing tables,
IDs, registration initialization and role/event restrictions. New SQL tests are in
`supabase/tests/database/profiles.test.sql`; existing grant assertions were updated for the
new intentional access surface.

New frontend pages: `/profile`, `/profile/edit`, `/users/:userId`. The users feature owns
profile/experience APIs/hooks and own/public/editor/game-row components. Games adds a real
catalog read API/hook alongside untouched event mocks. Geography adds a route-composed
profile adapter and an optional query-change callback to existing controls. Shared HTTP
transport is used by users and games. Router, navigation, account copy and auth-cache
cleanup were updated. New focused browser/client tests and root/frontend `test:profiles`
scripts require no new dependencies or lockfile changes.

Shared instructions, README, specification, design guidance, entity/schema/architecture/
roadmap and authentication documentation were updated. [Profiles](profiles.md) documents
setup, field behavior, endpoints and security. Event persistence, avatars, invitation codes,
administration and attendance eligibility policies remain out of scope.

## Executed checks

| Check                                  | Result                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm typecheck`                       | Frontend and backend passed                                                   |
| `pnpm lint`                            | Both passed, including boundaries; final run had no warnings                  |
| `pnpm build`                           | Both production builds passed                                                 |
| `pnpm test:backend`                    | 24 passed, including 3 profile API/adapter tests                              |
| Focused live local integration         | 4 passed, none skipped: profiles, Auth and two geography HTTP cases           |
| `pnpm db:lint`                         | No errors or warnings                                                         |
| `pnpm db:test`                         | 161 assertions passed; 42 focused profile assertions                          |
| `pnpm test:profiles`                   | 3 TAP checks passed: parent plus 2 account-isolation/public-projection cases  |
| `pnpm test:mock`                       | 12 TAP checks passed                                                          |
| `pnpm test:geography`                  | 6 TAP checks passed                                                           |
| Profile browser suite                  | 8 passed: 2 scenarios in each viewport/theme combination                      |
| Auth browser regression                | 2 passed at 1440px/dark                                                       |
| Mock event/location browser regression | Four-country create/edit/filter/join/leave case passed at 375px/dark          |
| Production profile smoke               | Own/edit/public views passed at both widths/in both themes; no console errors |

Commands used `pnpm.cmd` on PowerShell. Backend/Docker checks ran with the necessary local
sandbox access. The focused integration command selected `profiles.test.ts`, `auth.test.ts`
and `geography.test.ts`; it did not run geographic importer integration or reimport data.
Prepared SQL, stubbed repository tests and genuine database-backed checks are distinguished above.

## Security and persistence checks

Two genuine confirmed Supabase accounts exercised owner reads/writes, persistence through
a fresh API instance, safe public responses, experience add/change/remove and uniqueness.
Forged actor/role fields, immutable UUID/timestamp writes, invalid game IDs, unknown levels,
disabled/mismatched location selections and invalid private age were rejected.

Direct Data API tests verify public-safe profile reads, anonymous private-RPC denial,
private-schema unavailability, cross-account profile/experience mutation denial or zero-row
results, and immutable-column protection. SQL tests also verify private-age RLS, including
cross-account UPDATE, server-owned declaration timestamps and rollback/preservation of
public profile data when a combined private update fails. Roles and exact event locations
remain unavailable to ordinary clients. No service-role runtime client was introduced.

Static review found an account-switch mutation race; the implementation now checks the
expected UUID before requesting a bearer and validates own-profile response identity.
Focused client tests prove stale-owner reads/writes make no HTTP request, mismatched replies
are rejected, and public parsing excludes private fields. Logout/account changes remove
UUID-scoped profile caches; reads consume cancellation signals.

## Browser and visual review

Both profile scenarios ran at 375px and 1440px in dark and light themes. The main journey
uses real registration and a Mailpit confirmation link, verifies the friendly incomplete
profile, validates name/unconfirmed city input, saves private birth year and selected city,
refreshes to prove persistence, changes country with optional city, selects an accent-aware
city, and adds/updates/removes independently declared game experience. It verifies public
JSON/HTML exclude email/age/roles, opens another account's profile and repeats an anonymous
public read after logout. Protected editor visits return to real login.

The second journey checks delayed loading, persistent error/retry, empty catalog/game list,
failed-save value preservation, successful retry and a missing public profile. It exposed
an untouched-null birth-year conversion bug; that was fixed before the complete eight-case
matrix passed. Existing Auth confirmation/recovery/logout and development demo event flows
also passed their selected regression journeys.

Production preview was checked with real profile/catalog data in all four viewport/theme
contexts. Own details/private age, editing, public game levels and public privacy worked;
clearing birth year/location also succeeded. There was no horizontal overflow or unexpected
console error. Screenshots of own/edit/public profiles and mobile game controls were
visually inspected against the existing design; no token redesign was needed.

Expected simulated 503/404 and invalid-credential resource failures are handled states.
Browser scenarios had no uncaught page exceptions. Production smoke console-error arrays
were empty. An initial inline smoke assertion was corrected for PowerShell Unicode piping;
the UI had already saved correctly, and the repeat from a UTF-8 script passed.

Review artifacts are ignored under `backend/.tmp/profiles-review/`; Playwright runner output
is ignored under `frontend/test-results/`. Successful profile screenshots were copied before
the smaller regression runs replaced runner output. No credentials/session traces are part
of the deliverable. The new profile browser suite disables auth traces.

## Preserved data and limitations

The additive migration was actually applied locally. Final checks retained 46,243 city rows,
23,401 aliases and 8 catalog games, matching the initial counts. Temporary test/review
accounts were deleted individually; none of the profile fixtures remained. No import or
reset was needed. Existing local Supabase/Auth/mail services remain available.

Experience and birth year are self-declared and unverified. Optional birth year gives only
approximate age, and is not an attendance authorization rule. Public location/biography are
user-shared information; no precise address or private Auth email is copied into a profile.
Concurrent editing has normal last-write behavior; no conflict-resolution UI was added.
Chrome was tested; Safari/Firefox, real devices and screen-reader audits were not performed.
Hosted production/CORS/SMTP, retention/deletion workflows and deployment remain untested.

Numeric event/demo catalogs, event creation/editing and attendance remain mock dependencies,
available only through explicit development demo identity. Real profiles do not gain fixture
host/member access, and event changes still reset on reload. Milestone 4 must add explicit
UUID event adapters, server-authorized persistence and separately reviewed participation/
address policies. Milestone 3B is ready for PR review with these limits.
