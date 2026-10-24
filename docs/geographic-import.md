# Balkan geographic import and search

Milestone 2A adds geographic data and backend search only. The React app still uses its
existing Montenegro mocks, string city fields and demo login. Frontend country/city
autocomplete belongs to Milestone 2B.

## Source, scope and attribution

Source: [GeoNames](https://www.geonames.org/export/), using only the country extracts
[`ME.zip`](https://download.geonames.org/export/dump/ME.zip),
[`RS.zip`](https://download.geonames.org/export/dump/RS.zip),
[`BA.zip`](https://download.geonames.org/export/dump/BA.zip) and
[`HR.zip`](https://download.geonames.org/export/dump/HR.zip).
No worldwide gazetteer or worldwide alternate-name download is required.

The [extract readme](https://download.geonames.org/export/dump/readme.txt) specifies
UTF-8 tab-separated records and the **Creative Commons Attribution 4.0** license.
Give credit to GeoNames, link to the source/license and identify RollCall's filtering and
normalization. Suggested attribution for future location selection UI:
“Geographic data: GeoNames, CC BY 4.0. Filtered and normalized for RollCall.”

The four initially supported countries are Montenegro (ME), Serbia (RS), Bosnia and
Herzegovina (BA) and Croatia (HR). These are relational country rows, not a frontend enum.
GeoNames is community-maintained and supplied without a completeness, accuracy or
timeliness warranty. Broad coverage is not proof that every settlement is present/current.

## Included records

Only feature class **P** records with the following
[GeoNames feature codes](https://www.geonames.org/export/codes.html) are eligible:

| Codes                                      | Inclusion                                                          |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `PPL`                                      | Populated places, including towns and villages                     |
| `PPLA`, `PPLA2`, `PPLA3`, `PPLA4`, `PPLA5` | Seats of administrative divisions                                  |
| `PPLC`, `PPLCD`, `PPLG`                    | Capital/dependent-political-entity/seat-of-government places       |
| `PPLF`, `PPLL`, `PPLR`                     | Farm villages, populated localities and religious populated places |

There is **no population threshold**. Small settlements remain eligible even when population
is zero or unknown in the source. `PPLCH`, `PPLH`, `PPLQ` and `PPLW` are excluded because
they describe historical, abandoned or destroyed places. `PPLS` groups and `PPLX` city
sections are excluded to avoid treating aggregates/neighborhoods as independent event cities.
Other classes/codes are not silently included; the report records skipped categories.

Administrative `A.ADM1` and `A.ADM2` records in the same country extracts resolve source
region codes into readable labels. They are metadata, not additional city suggestions.
Canonical/ASCII names, country, coordinates, population, administrative codes, feature code,
GeoNames ID and modification date are retained. Alternate names come from the country
record's comma-separated convenience field plus its ASCII name.

## Run locally

Run commands from the repository root, using `pnpm.cmd` on PowerShell if necessary:

```bash
pnpm install
pnpm db:start
pnpm exec supabase db push --local
```

The migration command applies pending versioned SQL without resetting application data.
Do not use a reset to install this milestone into a database with data worth preserving.
No remote project should be linked or targeted.

Configure `GEOGRAPHY_DATABASE_URL` in ignored `backend/.env` with the **local PostgreSQL
connection string** shown by local Supabase status; the configured database port is `55322`.
Keep the password/connection string private. This maintenance-only variable is separate from
the runtime API's `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The importer rejects
non-loopback database hosts; there is no hosted-import flag in this milestone.

Download the four extracts and validate without changing the database:

```bash
pnpm geography:import --directory .tmp/geonames --download --dry-run
```

Import the same cached inputs:

```bash
pnpm geography:import --directory .tmp/geonames
```

Paths are relative to `backend/`, where the package script executes. The default directory
is `.tmp/geonames`; the default report is `.tmp/geonames/import-report.json`. Cached archives,
extracted text and routine reports stay ignored. Use `--report <path>` for a separately named
report, then review its non-secret provenance/counts before sharing it.

For offline inputs, place the four official `ME.txt`, `RS.txt`, `BA.txt` and `HR.txt` files in
the chosen directory, or provide their country ZIPs. Local text takes precedence over ZIPs.
`--download` fills missing country ZIPs; it does not silently replace a cached dataset.
`--download --refresh` explicitly fetches newer archives and refuses a directory containing
local text files, preventing an unnoticed text/archive mismatch.

```bash
# Explicitly choose a fresh source snapshot, then inspect its new checksums/counts.
pnpm geography:import --directory .tmp/geonames --download --refresh --dry-run
pnpm geography:import --directory .tmp/geonames
```

GeoNames country files change over time. Reproducing an exact run requires retaining the
same input files, not merely downloading from the same URLs later. Reports record SHA-256
checksums and source metadata; compare them before a rerun. Large ZIP/text files should not
be committed automatically. Retain reviewed small manifests/reports and attribution instead.

## Validation, transactions and identity

All four inputs are parsed before database changes. Validation checks the source field
shape, eligible country/code, names, stable identifier, coordinates, integer population and
source modification date. Invalid rows, exclusions and duplicate source IDs are reported.
Place names are SQL data, never SQL fragments: parameterized batches populate staging
records and set-based merges run within one transaction per country under an import lock.
A failure rolls that country's transaction back; previously committed countries remain.

`external_source = 'geonames'` plus `external_source_id` identifies an imported place.
RollCall's internal integer city ID remains unchanged on repeated imports, so event/profile
references remain valid. Source-owned metadata is refreshed for existing source identities.
Rows with an older source modification date than the stored version are skipped and reported,
preventing an old snapshot from silently downgrading newer metadata. Country moves/conflicting
source identity require review rather than silent reassignment. An input with no eligible
places for one country fails validation before any database changes.

The 13 original development samples can be adopted only when they are still recognizable
metadata-empty seed rows and exactly one existing seed and one source record match through
normalized canonical/ASCII/alternate names in the same country. Ambiguous matches are
reported and preserved; the importer never chooses a city solely because it has the same
name as another populated place. Arbitrary manually entered cities are not adopted.

No city is deleted because it disappears from a later extract. Aliases are additive and
manual aliases are preserved. This protects application data but does not automatically
retire renamed/deleted places or historical aliases; future reconciliation needs a reviewed
policy. A city alias is a searchable name for an existing city, not a separate place.

The per-country report distinguishes parsed, eligible, skipped/invalid/duplicate input and
the write outcomes `inserted`, `updated`, `adoptedSeeds`, `ambiguousSeeds`, `unchanged`,
`staleSourceRows` and `aliasesInserted`. Updated counts exclude adopted seeds. Input provenance
includes the input and decoded-text SHA-256 values, byte counts and official source URL;
download time/Last-Modified are retained only when the source sidecar matches the file.
Unknown local retrieval times remain null rather than invented. A dry-run reports source
validation only; it is not evidence that records were loaded. Verify counts and stable IDs
against the database after a real import before claiming success.

## Verified local snapshot

The four country extracts were actually imported on 24 October 2026:

| Country                     | GeoNames places | New rows | Adopted seed rows | Search aliases |
| --------------------------- | --------------: | -------: | ----------------: | -------------: |
| Montenegro (ME)             |           4,000 |    3,996 |                 4 |          1,618 |
| Serbia (RS)                 |           9,489 |    9,487 |                 2 |         11,021 |
| Bosnia and Herzegovina (BA) |          21,389 |   21,386 |                 3 |          5,227 |
| Croatia (HR)                |          11,363 |   11,361 |                 2 |          5,535 |
| Total                       |          46,241 |   46,230 |                11 |         23,401 |

All 13 original city IDs, countries and creation timestamps were preserved. Two ambiguous,
source-free samples remain separately: Beograd and Rijeka. Supplied aliases associate
Beograd with both Belgrade and Kiseljevo, and Rijeka with Rijeka, Reka and Budačka Rijeka.
The importer cannot prove a match from a name-only sample. These retained rows may appear
as legacy duplicate suggestions and need reviewed reconciliation that preserves references;
they are not counted as additional imported GeoNames places. Total city rows are 46,243.

A complete rerun inserted/updated/adopted no rows and added no aliases. The ordered identity
and alias digest remained identical. No invalid or conflicting duplicate source records were
found in this snapshot. Excluded feature-code counts and exact input/text checksums are in
the tracked [dataset manifest](geographic-dataset-manifest.json). Retain matching source bytes
for exact reproduction; GeoNames does not promise these mutable URLs retain a dated archive.

See [verification](geographic-verification.md) for executed checks and performance evidence.

## Search contract

`GET /api/cities?country=ME&q=...&limit=4` remains backward compatible. Existing fields remain
and country ISO/name plus administrative codes are additive. The server returns suggestions,
not the full geographic dataset. `country` is mandatory; malformed/duplicate/unknown query
parameters fail validation. Unsupported/disabled well-formed countries and unmatched names
return `[]`.

- Empty `q`: population descending, unknown population last, then normalized name and ID.
- Nonempty `q`: exact canonical/alias matches first, then prefixes, then substrings for at
  least three normalized characters. Population/name/ID break ties within each rank.
- One/two-character queries: prefixes only, avoiding unselective short substring scans.
- Normalization: trimmed/collapsed whitespace, case/accent folding, `Đ`/`Dj` and common Serbian
  Cyrillic-to-Latin forms. `Cacak` finds `Čačak`; `Niksic` finds `Nikšić` when present.
- Alias matches return each city ID once. Useful administrative labels/codes distinguish
  same-name settlements; names alone are never an identity key.
- Default results: four. The configured limit may be lower; the hard maximum remains twenty.
  `%`, `_` and backslash are literal input, not user-controlled wildcards.

Country/prefix B-tree indexes, population ordering and canonical/alias GIN trigram indexes
support the search. The RPC remains security invoker with bound parameters and caller RLS.
Alias reads are public catalog reads for enabled countries; no geography write grant is
added to `anon` or `authenticated`. Event/profile/role/private-address tables remain closed.

Run `pnpm geography:benchmark` after importing to record timings and query plans under
the anonymous role. The script extracts the installed search SQL for core-plan inspection,
uses bound parameters, and does not force planner settings. In the recorded local run,
PostgreSQL chose B-tree/country and population indexes, with filtering for substring branches;
it did not choose GIN trigram indexes under RLS. Index definitions alone are not proof of use.
Re-profile with production-like concurrency before changing grants, RLS or indexing.

## Data quality and verification limits

The convenience alternate-name field lacks the language, preferred-name and historical-name
flags available in the separate alternate-name dataset. Names in multiple scripts are
searchable where provided, but are not verified current names or trustworthy language labels.
Serbian transliteration is explicit; this is not typo correction or universal transliteration.

Administrative coverage/labels, population and coordinates may be missing, dated, duplicated
or politically disputed. Source country assignments and place IDs are retained rather than
invented corrections. Administrative codes should be interpreted in country context.

Parser fixtures prove validation behavior, not source coverage. Real database imports,
idempotency checks, bounded HTTP results, RLS tests and `EXPLAIN (ANALYZE, BUFFERS)` on the
loaded records establish the actual local behavior. Record hardware/cache/role context and
do not present local timings as a production SLA. Current execution counts and checks belong
in the milestone verification report alongside the exact input checksums.

Milestone 2B must consume country/search hooks, debounce queries, handle stale/loading/error/
empty responses, provide accessible selection, store selected city IDs and clear incompatible
selections after a country change. It must preserve the current design, mocks and feature
boundaries until their explicit integration work is approved.

Implementation references: [parameterized node-postgres queries](https://node-postgres.com/features/queries),
[fflate ZIP filtering](https://github.com/101arrowz/fflate), and
[PostgreSQL trigram indexes](https://www.postgresql.org/docs/17/pgtrgm.html).
