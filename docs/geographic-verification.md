# Milestone 2A geographic verification

Executed on 24 October 2026 on `feat/balkan-locations`, with Node.js 22.19.0,
pnpm 12.14.0, Supabase CLI 2.122.0, local Supabase PostgreSQL 17 and Docker 29.1.2.
No remote project was linked, changed, reset or deployed. No branch switch, commit,
push or merge was performed. The existing application database was not reset.

## Delivery and source data

The additive migration `20261024000300_balkan_geography.sql` was applied using
`pnpm exec supabase db push --local`. It adds source metadata, aliases, normalization,
search indexes and the enhanced invoker RPC, preserving original city IDs and grants.
The bounded normalizer definition was also reapplied from the migration source during
review. Existing migrations were not edited.

GeoNames ME/RS/BA/HR ZIPs were downloaded and actually loaded, not merely parsed:

| Country | Eligible imported places | Source aliases | Retained ambiguous samples |
| ------- | -----------------------: | -------------: | -------------------------: |
| ME      |                    4,000 |          1,618 |                          0 |
| RS      |                    9,489 |         11,021 |                          1 |
| BA      |                   21,389 |          5,227 |                          0 |
| HR      |                   11,363 |          5,535 |                          1 |
| Total   |                   46,241 |         23,401 |                          2 |

All 13 original sample IDs, country references and creation timestamps survived. Eleven
samples were enriched in place; Beograd and Rijeka were left unchanged because multiple
GeoNames records share their names/aliases. No source ID was duplicated. Total city rows
are 46,243, including those two preserved samples. Their possible duplicate suggestions
require reviewed reconciliation before public launch; the importer does not guess a merge.

The complete rerun reported 46,241 unchanged source places, zero inserts, zero updates,
zero adoptions and zero new aliases. An ordered identity/alias SHA-256 digest before and
after the rerun was identical:
`6ecd55d9dcb68df8a22e26ea22e06ae050096cd821839a012e9ff26478fccfbb`.

The importer's own network downloader was separately executed with `--download --dry-run`.
Its four ZIP checksums matched the imported cached inputs. The tracked
[dataset manifest](geographic-dataset-manifest.json) records actual archive/text hashes,
source URLs, byte counts, filters, exclusions and first/rerun counts. It contains no
connection strings. Large files and routine reports remain ignored.

## Checks actually executed

| Check                                                 | Result                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm install`                                        | Passed; PostgreSQL/ZIP tools pinned in the lockfile                                     |
| `pnpm typecheck`                                      | Frontend and backend, including importer/test types, passed                             |
| `pnpm lint`                                           | Both packages and frontend boundaries passed                                            |
| `pnpm build`                                          | Both production builds passed                                                           |
| `pnpm test:backend`                                   | 16 checks passed, including 7 importer/parser checks                                    |
| `pnpm test:mock`                                      | All 11 existing frontend checks passed                                                  |
| `pnpm test:integration`, `RUN_LOCAL_INTEGRATION=true` | All 3 checks passed; none skipped                                                       |
| `pnpm db:test`                                        | 100 pgTAP assertions passed against the full imported dataset                           |
| `pnpm db:lint`                                        | No schema errors or warnings                                                            |
| `pnpm db:test:concurrency`                            | Both existing real attendance races passed                                              |
| Import, complete rerun and identity verification      | Passed against actual local PostgreSQL                                                  |
| `pnpm geography:benchmark`                            | Passed the local one-second regression guard; actual plans retained                     |
| Compiled API server and real HTTP requests            | Four-country suggestions, Latin/Cyrillic/alias search, health and 400 validation passed |

Importer integration creates a randomly named disposable database on the loopback server,
applies all three migration files and seeds, then removes that database. A minimal
`auth.users` table supplies the Auth FK for this isolated harness; it is not a real Auth-flow
test. The actual application Supabase database separately received the migration and SQL/
HTTP checks. No developer application rows are reset by the importer suite.

The importer checks prove seed-ID/reference preservation, stable repeat imports, protected
manual aliases, independent country imports, metadata updates, stale-snapshot protection,
rejection of country moves, ambiguous-seed preservation and transaction rollback on invalid
coordinates. Parser tests also cover feature exclusions, aliases, administrative labels,
invalid input, conflicting duplicates, ZIP entry selection and remote-target rejection.

## Search and permissions

Live HTTP checks preserve the existing array response/error contract and verify the new
country/administrative fields. Real small-settlement examples include Donji Martinići (ME),
Prolom (RS), Agići (BA) and Režanci (HR). Tests verify `Cacak`/`Čačak`, `Niksic`/`Nikšić`,
Cyrillic input and the supplied `Titograd` alias returning Podgorica.

Actual default HTTP suggestions from the recorded dataset were:

- ME: Podgorica, Nikšić, Herceg Novi, Pljevlja.
- RS: Belgrade, Niš, Novi Sad, Novi Beograd.
- BA: Sarajevo, Banja Luka, Zenica, Tuzla.
- HR: Zagreb, Split, Rijeka, Osijek.

Exact matches precede prefixes, then substrings; one/two-character queries use prefixes
only. This means a small place named exactly `Pod` can precede Podgorica for `pod`, which
is intentional match ranking. Country filtering, limits, literal wildcard handling, no
matches, duplicate query rejection and disabled/unsupported countries are covered.

The new alias table has RLS and only read grants. The SQL suite checks anonymous writes,
country mismatch and disabled-country isolation. A live Data API control request first
proves that the credentials can read countries before checking that event reads are denied.
No service-role client, authenticated app grants, invitation code or upload workflow was added.

## Performance evidence

[Benchmark summary](geographic-search-benchmark.json) records 13 query cases, with 12
round trips each, under `SET LOCAL ROLE anon` on the 46,241 imported places and 23,401
aliases. Plans use `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` and the core SQL extracted
from the installed RPC. Planner settings were not forced.

In this single-client local run, per-case p95 database-client round trips ranged from
about 1.7 to 73.5 ms. Empty-query RPC execution was below 0.5 ms in the recorded plans;
nonempty RPC plans ranged up to about 51.2 ms. These are warm-cache development results,
not HTTP latency guarantees, concurrent load testing or a production SLA.

Observed plans used country/prefix B-tree, population and identity indexes. GIN trigram
indexes exist and are checked by SQL tests, but PostgreSQL did not select them for these
anonymous/RLS query plans; some substring branches filter country-scoped rows. Do not
claim a GIN speedup from the index definition alone. Re-profile under production-like
load and data growth before changing policy or indexing. The benchmark script deliberately
records actual choices and does not weaken RLS to force an index.

## Preserved scope and remaining limits

No frontend files, mocks, styles, themes, routes or forms were modified. Its production
build and mock journeys passed. Browser screenshots were not repeated for this backend-only
milestone; the preceding frontend review remains historical evidence.

The application database was upgraded in place, not destructively reset. Full hosted
deployment, production traffic, real Auth, Storage and administrative features were not
tested or implemented. Dataset completeness/currentness, population and administrative
accuracy remain source limitations. Convenience aliases lack language/historic flags;
additive imports do not retire disappeared places or aliases automatically.

Milestone 2A is ready for PR review with the documented legacy-seed and production-load
limitations. Milestone 2B must add the geography API/hooks, country selection, debounced
accessible city autocomplete, selected city IDs and clearing incompatible selections,
while preserving existing event/auth mocks until their separate integration milestones.
