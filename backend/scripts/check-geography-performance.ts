import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import pg from 'pg'
import { validateLocalDatabaseUrl } from './geography/store.js'

type PlanNode = { 'Index Name'?: string; Plans?: PlanNode[] }
function indexes(node: PlanNode): string[] {
  return [
    ...new Set([...(node['Index Name'] ? [node['Index Name']] : []), ...(node.Plans ?? []).flatMap(indexes)]),
  ]
}

async function main() {
  const { values } = parseArgs({
    options: { report: { type: 'string', default: '.tmp/geonames/search-benchmark.json' } },
    strict: true,
  })
  const client = new pg.Client({
    connectionString: validateLocalDatabaseUrl(process.env.GEOGRAPHY_DATABASE_URL),
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
  })
  try {
    await client.connect()
    const counts = await client.query(`select country.iso_code,count(*)::int places from public.cities city
      join public.countries country on country.id=city.country_id where city.external_source='geonames'
      group by country.iso_code order by country.iso_code`)
    assert.equal(counts.rows.length, 4, 'Import all four country extracts before benchmarking.')
    assert.ok(
      counts.rows.every((row) => row.places >= 1000),
      'Benchmark requires realistically sized imported data.',
    )
    const definition = (
      await client.query(
        "select pg_get_functiondef('public.search_cities(text,text,integer)'::regprocedure) definition",
      )
    ).rows[0].definition as string
    const core = definition.match(/\$search\$([\s\S]+?)\$search\$/)?.[1]
    assert.ok(core, 'Search core must be extracted from the installed function, not reconstructed.')
    await client.query('begin read only; set local role anon; set local statement_timeout=10000')
    const report: Record<string, unknown> = {
      generatedAt: new Date().toISOString(),
      role: 'anon',
      counts: counts.rows,
      context: 'Single local client, warm caches, actual imported records; not a production SLA.',
      queries: [],
    }
    const queries = []
    for (const [country, q] of [
      ['ME', ''],
      ['RS', ''],
      ['BA', ''],
      ['HR', ''],
      ['ME', 'nik'],
      ['RS', 'Cacak'],
      ['RS', 'Београд'],
      ['HR', 'rij'],
      ['ME', 'gor'],
      ['RS', 'grad'],
      ['BA', 'don'],
      ['HR', 'a'],
      ['BA', 'NoSuchPlaceRollCall'],
    ]) {
      const durations: number[] = []
      for (let i = 0; i < 12; i++) {
        const start = performance.now()
        const result = await client.query('select * from public.search_cities($1,$2,$3)', [country, q, 4])
        durations.push(performance.now() - start)
        assert.ok(result.rows.length <= 4)
      }
      const normalized = (await client.query('select public.normalize_place_name($1) value', [q])).rows[0]
        .value as string
      const countryId = (await client.query('select id from public.countries where iso_code=$1', [country]))
        .rows[0].id as number
      const literal = normalized.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
      const rpc = (
        await client.query(
          'explain(analyze,buffers,format json) select * from public.search_cities($1,$2,$3)',
          [country, q, 4],
        )
      ).rows[0]['QUERY PLAN'][0]
      const plan = q
        ? (
            await client.query(`explain(analyze,buffers,format json) ${core}`, [
              countryId,
              `${literal}%`,
              `%${literal}%`,
              normalized,
              4,
            ])
          ).rows[0]['QUERY PLAN'][0]
        : (
            await client.query(
              `explain(analyze,buffers,format json) select id from public.cities where country_id=$1
            order by population desc nulls last,normalized_name,id limit 4`,
              [countryId],
            )
          ).rows[0]['QUERY PLAN'][0]
      durations.sort((a, b) => a - b)
      queries.push({
        country,
        q,
        roundTrips: durations.length,
        medianMs: ((durations[5] ?? 0) + (durations[6] ?? 0)) / 2,
        p95Ms: durations[11],
        rpcExecutionMs: rpc['Execution Time'],
        coreExecutionMs: plan['Execution Time'],
        indexes: indexes(plan.Plan),
        corePlan: plan,
      })
    }
    await client.query('rollback')
    report.queries = queries
    assert.ok(
      queries.some((query) => query.indexes.some((name) => name.includes('prefix'))),
      'No prefix index was observed.',
    )
    report.observedTrigramUse = queries.some((query) =>
      query.indexes.some((name) => name.includes('trigram')),
    )
    report.indexNote =
      'Planner choices depend on selectivity and RLS; index existence is tested separately. No planner settings are forced.'
    assert.ok(
      queries.every((query) => (query.p95Ms ?? Infinity) < 1000),
      'A local search exceeded the 1-second regression guard.',
    )
    const file = path.resolve(values.report)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(report, null, 2) + '\n')
    console.log(
      JSON.stringify(
        { counts: counts.rows, queries: queries.map(({ corePlan: _plan, ...query }) => query), report: file },
        null,
        2,
      ),
    )
  } finally {
    await client.end()
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : 'Local geography benchmark failed. Check imported data, migrations and the local maintenance connection.',
  )
  process.exitCode = 1
})
