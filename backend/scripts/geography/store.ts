import type { Client } from 'pg'
import { COUNTRY_CODES, DEVELOPMENT_SEEDS } from './config.js'
import type { CountryCode } from './config.js'
import type { PlaceRecord } from './parse.js'

export type ImportCounts = {
  inserted: number
  updated: number
  adoptedSeeds: number
  ambiguousSeeds: number
  unchanged: number
  staleSourceRows: number
  aliasesInserted: number
}

// This maintenance connection is never used by the HTTP application.
export function validateLocalDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error('Configure GEOGRAPHY_DATABASE_URL with the local PostgreSQL connection URL.')
  try {
    const url = new URL(value)
    const allowedParameters = new Set(['sslmode'])
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      [...url.searchParams.keys()].some((key) => !allowedParameters.has(key))
    )
      throw new Error('invalid')
    return value
  } catch {
    throw new Error(
      'GEOGRAPHY_DATABASE_URL must target loopback PostgreSQL without host/connection overrides. Remote imports are not supported.',
    )
  }
}

export async function importCountry(
  client: Client,
  country: CountryCode,
  places: PlaceRecord[],
): Promise<ImportCounts> {
  if (!COUNTRY_CODES.includes(country)) throw new Error('Unsupported import country.')
  if (places.length === 0) throw new Error(`${country}: refusing an empty populated-place import.`)
  await client.query('begin')
  try {
    await client.query("set local statement_timeout = '120s'; set local lock_timeout = '10s'")
    // Shared across every importer process. Per-country commits make a failed rerun recoverable.
    await client.query('select pg_advisory_xact_lock($1, $2)', [20261024, 2])
    const catalog = await client.query<{ id: number }>(
      'select id from public.countries where iso_code = $1 and enabled',
      [country],
    )
    const countryId = catalog.rows[0]?.id
    if (!countryId) throw new Error(`${country}: the country must already exist and be enabled.`)
    await client.query(`create temporary table geography_stage (
      external_source_id text primary key, name text not null, ascii_name text,
      aliases text[] not null, administrative_division text, admin1_code text, admin2_code text,
      latitude numeric, longitude numeric, population bigint, feature_code text, source_modified_at date
    ) on commit drop`)
    for (let offset = 0; offset < places.length; offset += 500) {
      await client.query(
        `insert into geography_stage
        select * from jsonb_to_recordset($1::jsonb) as item(
          external_source_id text, name text, ascii_name text, aliases text[],
          administrative_division text, admin1_code text, admin2_code text,
          latitude numeric, longitude numeric, population bigint, feature_code text, source_modified_at date
        )`,
        [JSON.stringify(places.slice(offset, offset + 500))],
      )
    }
    const moved = await client.query<{ count: string }>(
      `select count(*) from geography_stage s join public.cities c
      on c.external_source = 'geonames' and c.external_source_id = s.external_source_id
      where c.country_id <> $1`,
      [countryId],
    )
    if (moved.rows[0]?.count !== '0')
      throw new Error(
        `${country}: source IDs already belong to a different country; manual review is required.`,
      )
    await client.query(`create temporary table geography_effective on commit drop as
      select s.* from geography_stage s left join public.cities c
        on c.external_source = 'geonames' and c.external_source_id = s.external_source_id
      where c.source_modified_at is null or s.source_modified_at >= c.source_modified_at`)
    const effectiveCount = await client.query<{ count: string }>('select count(*) from geography_effective')
    const staleSourceRows = places.length - Number(effectiveCount.rows[0]?.count ?? 0)
    await client.query(`create temporary table geography_names on commit drop as
      select distinct on (s.external_source_id, public.normalize_place_name(n.name))
        s.external_source_id, n.name, public.normalize_place_name(n.name) as normalized_name
      from geography_effective s cross join lateral unnest(array[s.name, s.ascii_name] || s.aliases) n(name)
      where n.name is not null and public.normalize_place_name(n.name) <> ''
      order by s.external_source_id, public.normalize_place_name(n.name),
        case when n.name = s.name then 0 else 1 end, n.name`)
    await client.query('create index on geography_names(normalized_name, external_source_id)')
    await client.query('create index on geography_effective(external_source_id)')
    await client.query('analyze geography_names; analyze geography_effective')
    // Only the explicitly known, otherwise blank development seeds are candidates.
    // Ambiguous names are preserved for manual review rather than guessed or deleted.
    await client.query(
      `create temporary table geography_seed_candidates on commit drop as
      select distinct c.id as city_id, n.external_source_id
      from public.cities c join geography_names n on n.normalized_name = c.normalized_name
      where c.country_id = $1 and c.name = any($2::text[]) and c.external_source is null
        and c.external_source_id is null and c.ascii_name is null
        and c.administrative_division is null and c.latitude is null and c.longitude is null
        and c.population is null and c.admin1_code is null and c.admin2_code is null
        and c.feature_code is null and c.source_modified_at is null`,
      [countryId, DEVELOPMENT_SEEDS[country]],
    )
    await client.query(`create temporary table geography_seed_adoptions on commit drop as
      select candidate.* from geography_seed_candidates candidate
      where (select count(*) from geography_seed_candidates other where other.city_id = candidate.city_id) = 1
        and (select count(*) from geography_seed_candidates other where other.external_source_id = candidate.external_source_id) = 1
        and not exists (select 1 from public.cities c where c.external_source = 'geonames'
          and c.external_source_id = candidate.external_source_id)`)
    const adopted = await client.query(`update public.cities c set external_source = 'geonames',
      external_source_id = adoption.external_source_id
      from geography_seed_adoptions adoption where c.id = adoption.city_id`)
    const ambiguous = await client.query<{ count: string }>(`select count(distinct candidate.city_id)
      from geography_seed_candidates candidate where not exists (
        select 1 from geography_seed_adoptions adopted where adopted.city_id = candidate.city_id)`)
    const updated = await client.query(`update public.cities c set
      name = s.name, ascii_name = s.ascii_name, administrative_division = s.administrative_division,
      admin1_code = s.admin1_code, admin2_code = s.admin2_code,
      latitude = s.latitude, longitude = s.longitude, population = s.population,
      feature_code = s.feature_code, source_modified_at = s.source_modified_at
      from geography_effective s where c.external_source = 'geonames' and c.external_source_id = s.external_source_id
      and row(c.name, c.ascii_name, c.administrative_division, c.admin1_code, c.admin2_code,
        c.latitude, c.longitude, c.population, c.feature_code, c.source_modified_at)
        is distinct from row(s.name, s.ascii_name, s.administrative_division, s.admin1_code, s.admin2_code,
          s.latitude, s.longitude, s.population, s.feature_code, s.source_modified_at)
      returning c.id`)
    const inserted = await client.query(
      `insert into public.cities(country_id, name, ascii_name,
      administrative_division, admin1_code, admin2_code, latitude, longitude, population,
      feature_code, source_modified_at, external_source, external_source_id)
      select $1, s.name, s.ascii_name, s.administrative_division, s.admin1_code, s.admin2_code,
        s.latitude, s.longitude, s.population, s.feature_code, s.source_modified_at, 'geonames', s.external_source_id
      from geography_effective s where not exists (select 1 from public.cities c
        where c.external_source = 'geonames' and c.external_source_id = s.external_source_id)
      order by s.external_source_id::bigint
      returning id`,
      [countryId],
    )
    // Add aliases without deleting older source aliases or replacing manual aliases.
    const aliases = await client.query(
      `insert into public.city_aliases(city_id, country_id, name, source)
      select c.id, c.country_id, n.name, 'geonames' from geography_names n join public.cities c
        on c.external_source = 'geonames' and c.external_source_id = n.external_source_id
      where c.country_id = $1 and n.normalized_name <> c.normalized_name
      on conflict (city_id, normalized_name) do nothing`,
      [countryId],
    )
    const insertedCount = inserted.rowCount ?? 0
    const updatedCount = updated.rowCount ?? 0
    const adoptedSeeds = adopted.rowCount ?? 0
    await client.query('commit')
    return {
      inserted: insertedCount,
      updated: Math.max(0, updatedCount - adoptedSeeds),
      adoptedSeeds,
      ambiguousSeeds: Number(ambiguous.rows[0]?.count ?? 0),
      unchanged: places.length - staleSourceRows - insertedCount - updatedCount,
      staleSourceRows,
      aliasesInserted: aliases.rowCount ?? 0,
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}
