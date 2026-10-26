# RollCall database schema

## Milestone 4D additions

`20261026000100_event_covers.sql` configures the private `event-covers` bucket (3 MiB,
JPEG/PNG/WebP MIME allowlist) and its operation-aware Storage RLS. No file metadata is
fabricated or deleted through SQL; runtime file operations use the supported Storage API.

`private.event_cover_config` has a singleton primary key and a 64-character SHA-256
`operation_key_hash`. Its random preimage exists only in server configuration. There are
no client-role table grants. The existing non-login/non-bypass event executor can read the
hash only through hardened functions, with explicit schema/digest permissions.

`private.event_cover_objects` has primary-key `path`, required event/host UUIDs, a unique
version UUID, state and created/updated timestamps. A check enforces
`path = event_id/version.webp`; a partial unique index permits one active object per event.
The existing `events.cover_storage_path` gains a manifest FK. Host/event identities remain
recorded after event deletion to authorize narrowly scoped recovery. Retired files may be
`cleanup` or `deleted`; deleted tombstones detect late interrupted uploads. There is no
unbounded global cleanup job. Synthetic verification records are removed only after actual
Storage cleanup succeeds.

Checked RPCs reserve, commit, abort, remove, read and retry/complete cleanup. Association
changes lock the parent event and verify its authenticated host plus the backend operation
capability. Commit additionally verifies actual canonical object metadata. Normal event PATCH
cannot attach arbitrary paths and its legacy null cover marker preserves the association.
An event-delete trigger queues associated paths rather than contacting Storage from SQL.

Storage INSERT/DELETE require the verified host, backend key and appropriate manifest state.
UPDATE/upsert, listing, copies and signed uploads have no policy. Downloads require the
current event association plus public/unlisted visibility or host/current membership;
signing additionally requires backend authorization to enforce short URL lifetimes. Existing
event/profile/location/attendance grants and policies remain intact. See
[cover implementation](event-covers.md) and [executed checks](event-cover-verification.md).

## Scope and reproducibility

Supabase PostgreSQL 17 is configured locally in `supabase/config.toml`. Versioned SQL
creates the application schema and the four-country catalog. Milestone 2A adds alias/search
and source metadata in `20261024000300_balkan_geography.sql`. `supabase/seed.sql` still adds
only a small development place/game dataset; geographic imports are explicit maintenance
commands. There are no Auth users, profiles or events
in the development seed; frontend demo users are not migrated into real accounts.

This document describes schema foundations and implemented profile/event access boundaries.
Through 3A only geography had client grants. Milestone
3B adds public profile/game/experience reads and owner-only profile/private-age/experience writes.
Milestones 4A/4B add checked event/attendance RPCs without raw client event/location/attendance grants.
All application tables retain RLS; raw event and role access remains denied by default.
The `private` schema is not exposed by the local Data API.

## Relationships

```mermaid
erDiagram
  AUTH_USERS ||--o| PROFILES : identity
  COUNTRIES ||--o{ CITIES : contains
  CITIES ||--o{ CITY_ALIASES : searchable_names
  COUNTRIES o|--o{ PROFILES : selected_country
  CITIES o|--o{ PROFILES : selected_city
  PROFILES ||--o| PROFILE_PRIVATE : private_age
  PROFILES ||--o| ACCOUNT_ROLES : assigned_role
  PROFILES ||--o{ USER_GAME_EXPERIENCE : declares
  GAMES ||--o{ USER_GAME_EXPERIENCE : experience_for
  PROFILES ||--o{ EVENTS : hosts
  GAMES ||--o{ EVENTS : game
  CITIES ||--o{ EVENTS : location
  EVENTS ||--|| EVENT_LOCATIONS : required_private_address
  EVENTS ||--o{ EVENT_PARTICIPANTS : attendance
  PROFILES ||--o{ EVENT_PARTICIPANTS : participates

  COUNTRIES {
    integer id PK
    text iso_code UK
    text name
    boolean enabled
    timestamptz created_at
  }
  CITIES {
    integer id PK
    integer country_id FK
    text name
    text normalized_name
    text ascii_name
    text administrative_division
    text admin1_code
    text admin2_code
    text feature_code
    date source_modified_at
    text external_source
    text external_source_id
  }
  CITY_ALIASES {
    integer city_id PK,FK
    integer country_id FK
    text name
    text normalized_name PK
    text source
  }
  PROFILES {
    uuid id PK,FK
    text display_name
    integer country_id FK
    integer city_id FK
    text biography
  }
  PROFILE_PRIVATE {
    uuid profile_id PK,FK
    smallint birth_year
    timestamptz age_declared_at
  }
  ACCOUNT_ROLES {
    uuid profile_id PK,FK
    text role
    uuid assigned_by FK
  }
  GAMES {
    integer id PK
    text name UK
    text category
    integer min_players
    integer max_players
  }
  USER_GAME_EXPERIENCE {
    uuid profile_id PK,FK
    integer game_id PK,FK
    text experience_level
  }
  EVENTS {
    uuid id PK
    uuid host_id FK
    integer game_id FK
    integer city_id FK
    integer capacity
    integer participant_count
    text visibility
    text status
  }
  EVENT_LOCATIONS {
    uuid event_id PK,FK
    text address
    boolean share_publicly
  }
  EVENT_PARTICIPANTS {
    uuid event_id PK,FK
    uuid profile_id PK,FK
    timestamptz joined_at
  }
```

The diagram abbreviates columns; the following tables and migrations define their full
constraints. `PROFILE_PRIVATE`, `ACCOUNT_ROLES`, and `EVENT_LOCATIONS` are in `private`.
The other application tables are in `public`. `AUTH_USERS` is managed by Supabase Auth.

## Geography

`public.countries`: integer identity PK; unique uppercase two-letter `iso_code`;
trimmed `name` of 2–100 characters; `enabled` defaults true; `created_at` defaults now.
The migration inserts ME/Montenegro, RS/Serbia, BA/Bosnia and Herzegovina, HR/Croatia.
There is no country CHECK limited to these four: future support is catalog data.

`public.cities`: integer identity PK and required country FK; trimmed name of 1–200
characters; required `normalized_name` maintained by a trigger using
`public.normalize_place_name`. Optional `administrative_division` is 1–200 characters. Optional
latitude/longitude use six decimal places, ranges −90..90 and −180..180 and must be
provided together. Optional population is a nonnegative bigint. Optional `external_source`
(1–50) and `external_source_id` (1–100) must be provided together. Creation time defaults
now. A partial unique source/ID index preserves stable external identity across imports.
Milestone 2A adds nullable `ascii_name` (1–200), `admin1_code` (1–20), `admin2_code` (1–80),
`feature_code` (1–10) and `source_modified_at` (date). Administrative codes are source
identifiers, not globally unique region IDs; interpret them within country/admin hierarchy.

City names are deliberately not unique: separate settlements may share a name. The
`(id, country_id)` unique key supports a composite profile FK, preventing a selected city
from belonging to another selected country. A country/name `text_pattern_ops` index
supports normalized prefix search; another country/population/normalized-name/ID index
supports suggestions. Milestone 2A adds canonical-name and alias-name GIN `pg_trgm`
indexes for substring matching. Actual query-plan/timing evidence must come from the loaded
dataset; index definitions alone are not proof of production performance.

`public.city_aliases`: city ID, matching country ID, trimmed source name (1–200), normalized
name (1–400) and source label (1–50, default `geonames`). Its primary key is
`(city_id, normalized_name)`; multiple place IDs may share a name. The composite foreign key
`(city_id, country_id)` references `cities(id, country_id)` and cascades on city deletion.
A trigger maintains normalization. Country/name-prefix and GIN trigram indexes support
search without downloading aliases to the client.

`public.normalize_place_name(text)` is STABLE, STRICT and security invoker with an empty
search path. It trims/lowercases, applies explicit common Serbian Cyrillic and `Đ`/`Dj`
transliteration, and calls schema-qualified `unaccent`. It is not declared immutable because
the extension's dictionary can change. Triggers persist the result in indexed columns;
changing normalization rules/dictionaries requires a deliberate backfill and plan review.

`public.search_cities(country_code text, search_query text default '', result_limit integer
default 4)` is stable and **security invoker**, with an empty search path and schema-qualified
relations/functions. It validates an uppercase two-letter country, query ≤80 characters
without controls, and limit 1–20. It normalizes the query, escapes SQL wildcard characters,
filters enabled ME/RS/BA/HR countries and searches canonical/alias normalized names. Exact
matches rank first, prefixes second and substrings third. Substrings require at least three
normalized characters to avoid broad short-query scans. Ties use population descending/null
last, normalized name and ID; empty queries use only this prominence order. City IDs are
deduplicated across aliases. Wildcards are literal, and static parameter-bound execution
allows a query-specific prefix plan without interpolating user text.

The RPC retains its original fields and adds country ISO/name plus admin1/admin2 codes.
Fastify explicitly maps a smaller camelCase DTO. Search is not typo correction, general
multilingual transliteration, or a guarantee that every source name variant is current.

## Profiles, roles and game experience

| Table                         | Fields and constraints                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.profiles`             | UUID `id` PK/FK to `auth.users.id`; trimmed display name 2–80; optional country/city (city requires country and matching composite FK); optional biography ≤500; created/updated timestamps |
| `private.profile_private`     | Profile UUID PK/FK; optional self-declared birth year ≥1900 and not in the future; birth year and declaration timestamp must both be null or both present; updated timestamp                |
| `private.account_roles`       | Profile UUID PK/FK; `user`, `admin`, or `superadmin` role (default `user`); optional `assigned_by` profile reference; created/updated timestamps                                            |
| `public.games`                | Integer identity PK; unique trimmed name 2–100; category in existing four frontend categories; description 10–1000; integer min players ≥1 and max ≥min; created/updated timestamps         |
| `public.user_game_experience` | Composite PK `(profile_id, game_id)`; profile UUID/game integer FKs; experience `beginner`, `intermediate`, or `veteran`; created/updated timestamps                                        |

Missing role assignment means an ordinary user in the planned authorization model; no
role lookup/management endpoint is implemented. Client metadata cannot assign roles.
Only a later authorized superadmin workflow may promote/demote admins. Initial superadmin
bootstrap and auditing require a controlled server/operations procedure, not a public seed.

Private birth year provides approximate self-declared age guidance without collecting a
birth date. It is neither verification nor an automatic public profile field. Per-game
experience is independently self-declared and is not a verified qualification. Public
profile DTOs now explicitly expose selected games/experience while omitting private age and email.

Profile country/city selections can remain unset in Milestone 3B. A city must belong to the
selected enabled country; country-only profiles are valid. Milestone 1 had no Auth initializer. Milestone 3A adds
`20261024000400_auth_profile_initialization.sql`: a private, SECURITY DEFINER trigger with
empty search path inserts only the registered Auth UUID and fixed `RollCall player` display
name. It copies neither email nor editable metadata, geographic selections, private age or
roles. Function execution is revoked from API roles; clients receive no new table privileges.
An idempotent backfill initializes missing Auth-linked profiles without overwriting existing
rows. Existing RLS and deny-by-default profile/event policies remain. UUID identity can be
verified through `/api/me`. Milestone 3B adds scoped profile permissions below. See
[authentication](authentication.md) for registration and future onboarding boundaries.

## Events and protected locations

`public.events` contains:

| Field                           | Constraint                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                            | UUID PK, generated by PostgreSQL                                                                                                          |
| `host_id`, `game_id`, `city_id` | Required existing profile/game/city references; country derives from city                                                                 |
| `title`, `description`          | Trimmed title 3–100; trimmed description 10–5000                                                                                          |
| `venue`                         | Nullable; when supplied, trimmed 2–120 characters                                                                                         |
| `starts_at`, `ends_at`          | Required finite timestamptz values; end strictly after start; new/editable events must start in the future                                |
| `capacity`                      | Integer 1–100; host is excluded                                                                                                           |
| `participant_count`             | Integer default 0; always 0..capacity; maintained by membership triggers, never a future client-editable field                            |
| `experience_level`              | `all-levels`, `beginner`, or `experienced`                                                                                                |
| `price`, `currency`             | Nonnegative numeric ≤10000, at most two decimals; currency fixed to EUR; invalid extra precision is rejected rather than silently rounded |
| `cover_storage_path`            | Nullable registered private Storage object path with a manifest FK in 4D; no data URLs or signed URLs are stored here                  |
| `tags`                          | Required text array, default empty; 0–6 unique canonical values and compatibility checks below                                            |
| `minimum_age`                   | Integer 0–99; 0 means all ages; informational guidance                                                                                    |
| `visibility`                    | `public`, `private`, or `unlisted`, default public                                                                                        |
| `status`                        | `scheduled` or `cancelled`, default scheduled                                                                                             |
| `created_at`, `updated_at`      | Required timestamps with now defaults; updates touch updated time                                                                         |

Event ID, host and creation time are immutable after insert. A new event cannot carry a
nonzero participant counter. A write trigger enforces future starts on new or materially
edited records; internal attendance counter/timestamp updates do not revalidate old start
times. Database ownership is not API authorization: 4A create/edit routes use verified
actors, host checks and strict allowlisted payloads, with equivalent SQL enforcement.

Canonical tags mirror the frontend: Beginner friendly, Veterans only, Casual, Competitive,
One-shot, Campaign, Bring your own deck, Equipment provided. Tags cannot contain nulls,
duplicates or arbitrary values. Beginner friendly and Veterans only are incompatible;
the former requires all-levels/beginner and the latter experienced. These checks apply
to the final merged database row.

`private.event_locations` has an event UUID PK/FK, required trimmed address of 3–200
characters, `share_publicly` default false, and updated timestamp. Deferred constraint
triggers require an address record for each in-person event by transaction end, so a
4A create transaction can insert event and protected location together. Exact addresses
are never columns on public event records. The opt-in flag itself grants no access and
must never expose a private event before authorization.

Host/game/city FK indexes and a partial scheduled-public `(starts_at, id)` index support
event ownership and discovery reads. Milestone 4A adds a partial public/scheduled title
GIN trigram index and bounded keyset discovery. No table or existing record is replaced.

## Attendance and transactional capacity

`public.event_participants` has event UUID/profile UUID FKs, a composite primary key
preventing duplicate membership, and `joined_at`. Membership rows are immutable;
join/leave operations insert/delete instead of rewriting identities. A profile-side index
supports membership lookup.

An AFTER INSERT trigger atomically increments `events.participant_count` only when the
event is scheduled, future, non-host and below capacity. Competing final-seat inserts
serialize on that parent row; a failed increment raises an error and rolls the inserted
membership back. Running after insert preserves `ON CONFLICT DO NOTHING` semantics for
duplicate members. The count/capacity CHECK also prevents an edit below current attendance.
Deletion decrements the counter only for an available event; event deletion's cascading
membership cleanup is exempt. The 4B attendance functions enforce private-event access,
verified actor identity and actual timing before writes. Clients cannot directly edit counters
or memberships through the Data API; only checked subject-scoped attendance RPCs are exposed.

`20261025000400_event_attendance.sql` reuses the existing table, composite key, counter
arithmetic and trigger bodies. Checked `join_event(uuid)`/`leave_event(uuid)` wrappers lock
the event first, then check access/state/host/membership/capacity inside one transaction.
Current participants can repeat joins even when full; accessible nonmember leaves are no-ops.
State checks still precede no-op handling. Event timestamps do not change on no-ops.
Capacity edits and event deletion serialize on the same row. Failed operations roll back
membership and counters together; the host never occupies a seat.

The existing counter and required-location trigger functions now have SECURITY DEFINER
ownership under `rollcall_attendance_counter`, a NOLOGIN/NOINHERIT/NOBYPASSRLS role.
It can SELECT only event columns needed by those bodies, UPDATE(participant_count), and
SELECT(event_id) on protected locations; it cannot read address text, edit event content,
change memberships or assume account privileges. Empty search paths and closed function
ACLs keep these trigger-only capabilities out of client calls. RLS remains enabled with
focused counter/invariant policies. This handles deferred checks after private leave without
retaining the departed participant's address permission.

The existing event executor gains owner-only membership SELECT/INSERT/DELETE, never UPDATE.
Membership policies reference only the subject, avoiding recursion through event policies.
Event/location read policies recognize current membership; private outsiders remain hidden.
A separate lock-only UPDATE policy has readable-row USING and false WITH CHECK, so
attendance can SELECT FOR UPDATE but a nonhost still cannot produce an updated content row.
The original host-only content check and immutable-host/column restrictions remain intact.

`20261025000500_attendance_private_recheck.sql` rechecks membership after lock acquisition
using a fresh command snapshot, before state-specific errors. This protects against stale
private access if a concurrent leave commits while another request waits. Actual time is
checked after the lock, so a queued join cannot use the transaction's earlier now() to join
an event that has started. Existing private members may leave; no outsider admission is added.

Detail DTOs now include viewer state and return protected addresses to hosts/current members
only; discovery summaries remain safe/public. Join/leave return a small address-free summary,
including after private leave removes detail access. No API/client table grants, service-role
path, new attendance table, geographic import or destructive migration is required.
See [event contracts](events-api.md) and [attendance verification](attendance-verification.md).

## Delete behavior and timestamps

- Country deletion is restricted by cities/profiles. City deletion is restricted by profiles/events.
- Auth-user deletion cascades toward its profile. Profile private details, role assignments and
  per-game experience cascade with profile deletion; `assigned_by` becomes null if its referenced
  profile is deleted. Existing host/participant references restrict profile deletion, so real
  account deletion needs an explicit future event/attendance retention workflow.
- Game deletion is restricted by events and user-game experience.
- Event deletion cascades to attendance and the private address. A deferred address check
  permits whole-event deletion while preventing an orphaned location-less live event.
- Profiles, private age/roles, games, experience, events and private locations have update
  triggers for `updated_at`. Immutable membership has `joined_at`; geography has creation time.

## RLS and grants

All application tables, including those in `private` and the new city alias table, have RLS enabled. Migrations
revoke implicit client grants on application tables/sequences/functions and PostgreSQL
default function execution. The original migrations grant geography SELECT and search execution to
`anon` and `authenticated`. Countries expose enabled rows; city SELECT requires an enabled
parent country. Aliases require an enabled matching country as well. Search is security
invoker so direct calls retain these restrictions. Direct table reads remain catalog reads;
the bounded RPC additionally restricts searches to the four supported countries.

Milestone 3B migration `20261025000100_user_profiles.sql` adds public-safe SELECT on profiles,
games and user-game experience. Authenticated UPDATE on profiles is limited to display name,
biography and country/city; owner RLS applies, and identity/timestamps cannot be supplied.
Experience INSERT/UPDATE/DELETE is owner-scoped and keeps the unique profile/game PK.

The private schema remains outside the API's exposed schemas. Authenticated schema USAGE
and private-profile SELECT/limited INSERT/UPDATE support only owner data under RLS; no role,
event-location or service-role grants are added. SECURITY INVOKER RPCs `get_my_profile()`
and `update_my_profile(jsonb)` enforce the caller and make public/private changes atomic.
`public_profile(uuid)` constructs safe JSON; `set_my_game_experience` and
`remove_my_game_experience` derive the owner and validate game/level. All have empty search
paths and explicit execute grants. No application service-role grants are provided or needed.
The database owner remains an administrative trust boundary and must not become the
ordinary request identity.

Trigger/helpers use schema-qualified objects and hardened empty search paths. There is
no general-purpose privileged RPC or role-management shortcut. The focused event functions
below ship with actor-specific allow/deny tests.

### Milestone 4A event migrations

`20261025000200_events_api.sql` adds the title index, `rollcall_events_executor` role,
reference/event/location policies and private validation/DTO/checked entry functions.
At the 4A boundary the executor is NOLOGIN, NOINHERIT and NOBYPASSRLS, does not own event tables, and has
no membership writes, participant-count updates or host reassignment privileges. 4B adds
only subject-scoped membership access as described above. Mutable
column grants and RLS limit event/location writes to `auth.uid()` ownership. Raw event,
location and attendance permissions stay closed to anon/authenticated clients.

Public `discover_events(jsonb)`, `get_event(uuid)`, `create_event(jsonb)`,
`update_event(uuid,jsonb)` and `delete_event(uuid)` are SECURITY INVOKER wrappers for
checked private entry points owned by the executor. Execution ACLs allow public reads,
authenticated writes and no unbounded/internal helper calls. Private schema USAGE allows
naming explicitly executable functions only, without exposing the schema via PostgREST.

`20261025000300_event_executor_identity.sql` adds the argument-free migration-role-owned
`private.event_api_actor()`: it only calls `auth.uid()`, reads no tables and is executable
only by the executor. This bridges Supabase's separately owned Auth schema without broad
runtime privileges. Four event helpers and owner RLS policies use that resolver. Timestamp
and input conversion helpers are STABLE. Temporary ownership-transfer membership is revoked
at migration end; PostgreSQL may retain non-inheritable administrative membership for the
trusted migration role, never API roles.

Creation/update atomically persist the protected address and event DTO. Updates lock the
event, validate merged values and reject capacity below attendance. Deferred address
constraints execute inside the executor context. Deletion cascades locations/memberships;
profiles/geography/catalog remain intact. Private details and addresses are host-only in 4A,
regardless of sharing flags, participation or roles. All public DTOs explicitly omit them.
The two 4A additive migrations change no geography/profile records or registration initializer.
See [event API](events-api.md) and [verification](events-api-verification.md).

Invitation secrets have no table/column in Milestone 1. A later dedicated, non-exposed
table must support verification hashes, authenticated encrypted retrieval, rotation and
revocation. Ordinary participants never receive the code. See
[the authorization design](backend-architecture.md) for planned workflows.

## Development seed and geographic import

The seed contains 13 real place names: ME Podgorica/Nikšić/Budva/Bar; RS Beograd/Novi Sad/
Čačak; BA Sarajevo/Banja Luka/Mostar; HR Zagreb/Split/Rijeka. It is a manually curated,
incomplete development sample. Optional coordinates, divisions, population and source IDs
are left null rather than fabricated. Eight games mirror the existing frontend catalog
for convenient development; matching seed numbers are not an identity-migration strategy.

Milestone 2A's explicit importer reads the four GeoNames country extracts, selecting eligible
populated places without a population minimum. SHA-256 inputs and per-country reports record
provenance and outcomes. The `(external_source, external_source_id)` identity supports reruns
without changing internal IDs. Only unambiguous recognized development seeds are adopted;
manual/ambiguous records are preserved. Administrative labels are resolved from ADM1/ADM2
records in the same country files. Imported aliases remain source-labeled and additive.

Import metadata is source-owned; no city is removed because it is absent from a newer
extract. This prevents destructive updates to referenced application locations but means
source deletions/renames and alias retirement need an explicit reviewed reconciliation policy.
See [geographic import](geographic-import.md) for exact inclusion codes, CC BY 4.0 attribution,
commands, counts and limitations. Neither the sample seed nor the broader import is a claim
of perfect geographic completeness.

## Local verification

From the root, `pnpm db:start` initializes the local stack. `pnpm db:reset` destroys and
rebuilds only the local database; inspect/preserve existing data before any reset. Use
`pnpm exec supabase db push --local` to apply pending migrations without resetting data.
`pnpm db:lint` performs local SQL analysis and
`pnpm db:test` runs the committed SQL assertions. `pnpm db:test:concurrency` uses separate
local PostgreSQL transactions to verify final-seat and capacity races. Run `pnpm test:integration` with the
explicit local opt-in described in [backend setup](../backend/README.md) to exercise the
HTTP/database boundary. SQL files being present does not mean these commands succeeded;
the delivery report must state the actual execution results and any unavailable checks.

Official references: [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html),
[Supabase database functions](https://supabase.com/docs/guides/database/functions),
[Supabase API security](https://supabase.com/docs/guides/api/securing-your-api),
[Supabase local configuration](https://supabase.com/docs/guides/local-development/cli/config),
and [GeoNames export/license](https://www.geonames.org/export/).

## Milestone 5A

The additive 20261026000200_private_invitations.sql creates private invitation and attempt tables, RLS/ACLs and a non-login/non-bypass executor. Parent-event locks serialize code changes with admission; existing membership triggers alone update counts. No plaintext codes or client role assumption. See [details](private-invitations.md).

## Milestone 5B-1

Two additive 5B-1 migrations reuse account_roles, add RLS-protected role_audit and restricted current-role RPCs, and preserve all existing records. A NOLOGIN/NOBYPASSRLS executor has only profiles/roles and select/insert audit access, with no raw Auth/private age/event-secret access. Narrow internal confirmation helpers accommodate separate Supabase Auth ownership. Bootstrap and role updates serialize and audit atomically; no public bootstrap or superadmin-assignment RPC. See [details](administration.md).

## Milestone 5B-2A

The additive 20261026000500_event_moderation.sql creates private RLS-protected reports, attempt counters and append-only audits, with a separate NOLOGIN/NOBYPASSRLS executor. Event privileges are column-limited reads and UPDATE(status) only; no locations, codes, ages, raw Auth or role writes. Checked RPCs enforce current roles and event access. Shared role locks, parent-first event/report locks and atomic audit/state writes coordinate demotion, attendance and deletion. A guarded status trigger prevents reactivation of audited moderator cancellations. See [security design](event-moderation.md).

## Milestone 5B-2B

20261026000600_account_suspensions.sql adds private RLS-protected state/audit tables, a narrow NOLOGIN/NOBYPASSRLS executor, live subject guard, reviewed RPC preludes and owner-write/private-age RLS enforcement. Existing event/admin/Storage subject resolution now rejects suspended callers. Guarded reads are VOLATILE; role-first/account-shared/existing-domain locks coordinate target-exclusive status transitions. Role mutation keeps its exclusive-role-first ordering. No Auth Admin API, role-write grant or data reset is added. See [security design](account-suspensions.md).

## Staging operator provisioning (6A-1)

Additive migration `20261026000700_staging_provisioning.sql` adds
`private.staging_provisioning`: singleton key, fixed `staging` environment, cover-operation
SHA-256 fingerprint, domain-separated invitation-key fingerprint and provisioning timestamp.
RLS is enabled with no client/executor policies; all privileges are revoked from public,
anon, authenticated and service_role. Only the maintenance operator accesses it. No raw
secret, email, account identity or public API response is stored here. Exact retries preserve
the existing roots; conflicts refuse rotation. Existing `private.event_cover_config` retains
the runtime cover verification hash. See [staging setup](hosted-supabase-staging.md).
