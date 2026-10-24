# Milestone 2B verification

Executed on 24 October 2026 on `feat/location-ui`, Windows, Node.js 22.19.0,
pnpm 12.14.0, Playwright 1.64.1 with installed Google Chrome, and the existing local
Fastify/Supabase geography stack. No branch switch, commit, push, merge, deployment,
remote database operation or application database reset was performed.

## Implemented boundary

React now reads only `GET /api/countries` and
`GET /api/cities?country=<ISO>&q=<query>&limit=4` from Fastify. Events, participation,
users, games and login remain frontend mocks. Backend source and SQL migrations did not
change in this milestone. The imported geography was reused without reimporting it.

New source includes the geography feature, its HTTP client/hooks/controls, the shared
`lib/location.ts` reference contract, frontend environment example, Playwright configuration,
browser scenarios and geography-client checks. Existing event forms/validation/filtering,
routes, display components, Vite proxy and shared docs were updated.

## Executed checks

| Check                                      | Result                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`                           | Frontend and backend passed                                                                            |
| `pnpm lint`                                | Both packages passed, including frontend feature boundaries                                            |
| `pnpm build`                               | Both production builds passed with Fastify stopped                                                     |
| `pnpm install --frozen-lockfile`           | Passed                                                                                                 |
| `pnpm test:mock`                           | 12 TAP checks passed; existing journeys retained and location checks added                             |
| `pnpm test:geography`                      | 6 TAP checks passed, including five client cases                                                       |
| `pnpm test:backend`                        | All 16 checks passed                                                                                   |
| `pnpm test:integration`, with local opt-in | All 3 checks passed, none skipped                                                                      |
| `pnpm db:test`                             | All 100 pgTAP assertions passed                                                                        |
| `pnpm db:lint`                             | No schema errors or warnings                                                                           |
| `pnpm test:ui`                             | All 12 scenarios passed at both widths/in both themes                                                  |
| Final scoped client/form checks            | Client suite and desktop four-country journey passed after client file organization/final copy changes |
| Production preview, Fastify stopped        | Geography error/retry shown, 7 mock cards still browseable, no application exception                   |
| Production preview, Fastify restored       | Both themes and widths passed suggestion/layout/form smoke checks with no console errors               |

Commands were run as `pnpm.cmd` on PowerShell. Browser commands require the local services
described in [setup](location-ui.md). The root build itself requires no running server.

## Browser matrix and journeys

The full suite ran three scenarios in each configuration, after the final dropdown/layout
adjustments:

| Viewport    | Theme | Scenarios |
| ----------- | ----- | --------- |
| 375 × 1000  | Dark  | 3 passed  |
| 375 × 1000  | Light | 3 passed  |
| 1440 × 1000 | Dark  | 3 passed  |
| 1440 × 1000 | Light | 3 passed  |

The scenarios cover:

1. Homepage search using actual `Niksic` → `Nikšić` results, selected-ID discovery with
   legacy fixture matching, anonymous address hiding, and editing a legacy event only
   after confirming its city. The existing event ID survives the edit.
2. Creating events in Podgorica, Belgrade, Sarajevo and Zagreb without a venue; rejecting
   unselected typed city text; country-only filtering; combined country/city/title/game/
   availability filters; matching selected IDs; reset; browser Back/Forward restoration;
   changing an event's country/city; and demo login/join/leave/address-display behavior.
3. Persistent simulated country failure and explicit retry, four initial city suggestions,
   ArrowUp/ArrowDown/Enter/Escape behavior, no matches, city failure/retry, a delayed old
   response that cannot replace newer results, request debouncing, immediate country-change
   clearing, and Latin/Cyrillic `Cacak`/`Чачак` → `Čačak` results.

Ordinary journeys use the actual geography backend and contain no console errors.
The outage scenario deliberately returns HTTP 503 through Playwright routing; those
expected resource failures are handled by the UI and produce no uncaught application
exceptions. No fake geography fallback is used in application code.

Original attempts exposed assumptions in test selectors: anonymous attendance uses the
existing “Log in to join” action, native selects also expose option roles, React development
mode may cancel an initial request, and mouse hover affects the active suggestion. Tests
were corrected to target actual controls/states; no product behavior was weakened to pass.

## Production and visual review

The final built app was served with Vite preview. With Fastify stopped, country/city
controls were disabled with a country retry action, while seven mock event cards loaded.
The app did not silently substitute local country/city fixtures.

After restoring Fastify, production checks at both widths and themes confirmed four real
suggestions, a usable location form, no horizontal overflow and empty console-error
collections. Screenshot review covered home, discovery, the popup, the reusable form,
selected-region text and optional venue. Desktop field labels align independently of
helper text. A low mobile input opens its four-result list above itself; the active option
is kept in view for keyboard navigation.

Local review screenshots and machine-readable smoke results are retained in ignored
`backend/.tmp/location-ui-review/`. Playwright writes screenshots/traces to ignored
`frontend/test-results/`; each runner invocation replaces that output directory. No
generated browser artifacts or downloaded datasets are required in Git.

## Data and privacy limits

New form selections preserve actual backend integer `cityId`/`countryId`, ISO code and
display/administrative labels in a `LocationReference`. The existing string city remains
for mock compatibility. Old fixtures keep their city labels and explicit ME country;
they receive no invented database IDs. Their country-scoped name filter bridge is a
transitional approximation, not a verified geographic foreign key. Confirming a suggestion
when editing replaces that ambiguity with the selected reference.

Venue input is optional and stores `''` when absent. Nonblank values retain the 2–120
character rule. Address remains required and is rendered only for the host or current
attendees, including after join/leave. Mock objects still contain addresses in browser
memory: the display restriction is not authentication or a security boundary. Future
event endpoints must verify the actor, enforce address access, validate the city FK and
derive country information server-side rather than trusting the display snapshot.

Events and attendance reset on page reload. Demo login remains simulated. Existing
GeoNames quality limitations and the two ambiguous source-free seed rows remain documented
in [geographic import](geographic-import.md). No real accounts, persistent events, private
codes, uploads or role management were implemented.

Chrome was tested; Firefox/Safari, real-device virtual keyboards and assistive-technology
audits were not executed. Production hosting, cross-origin CORS configuration and remote
Supabase were not tested or deployed. Local same-origin dev/preview proxying was tested.

Milestone 2B is ready for PR review with these documented limits. Milestone 3 can introduce
real Supabase identity and profile onboarding with server authorization and deliberate UUID
adapters. Persistent event/attendance APIs and secure address delivery remain separate work.
