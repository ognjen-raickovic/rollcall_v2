import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import { z } from 'zod'
import { stagingTarget, type StagingAction } from './target.js'
import { migrationAudit } from './audit.js'
import { initializeStagingCatalog, stagingGames } from './catalog.js'
import { validateStagingGeography } from './geography.js'
import { generateStagingKeys, readStagingKeys, provisionStagingKeys } from './keys.js'
import { importCountry } from '../geography/store.js'
import { bootstrapStagingAccount } from './bootstrap.js'

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      target: { type: 'string' },
      'project-ref': { type: 'string' },
      confirm: { type: 'string' },
      apply: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      directory: { type: 'string' },
      'user-id': { type: 'string' },
      help: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: true,
  })
  const action = positionals[0]
  if (values.help) {
    console.log(
      'staging:prepare audit|catalog|geography|keygen|provision-keys|bootstrap --target=staging [--directory=path] [--project-ref=approved-ref --apply --confirm=staging:<ref>:<action>]',
    )
    return
  }
  if (
    values.target !== 'staging' ||
    positionals.length !== 1 ||
    !['audit', 'catalog', 'geography', 'keygen', 'provision-keys', 'bootstrap'].includes(action ?? '') ||
    (values.apply && values['dry-run'])
  )
    throw new Error(
      'Choose one explicit staging action; dry-run is the default and cannot be combined with apply.',
    )
  const audit = await migrationAudit()
  if (action === 'audit') {
    console.log(JSON.stringify(audit, null, 2))
    if (!audit.readyForRollout) process.exitCode = 1
    return
  }
  if (action === 'keygen') {
    if (!values.apply) {
      console.log(
        'Dry run: independent keys would be generated in backend/.staging/server-secrets.env without overwriting existing keys.',
      )
      return
    }
    if (values.confirm !== 'GENERATE_STAGING_KEYS')
      throw new Error('Local key generation requires --confirm=GENERATE_STAGING_KEYS.')
    await generateStagingKeys()
    console.log('Generated independent staging keys in the operator-only file; values were not printed.')
    return
  }
  const geography =
    action === 'geography'
      ? await validateStagingGeography(path.resolve(values.directory ?? '.geography'))
      : null
  if (action === 'bootstrap' && !z.uuid().safeParse(values['user-id']).success)
    throw new Error('Select an existing confirmed account with --user-id; no default account is chosen.')
  if (!values.apply) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          action,
          readyForRollout: audit.readyForRollout,
          blockers: audit.blockers,
          ...(action === 'catalog'
            ? {
                essentialCountries: 4,
                games: stagingGames.map(({ id, name }) => ({ id, name })),
                developmentCitiesOrAccounts: false,
              }
            : {}),
          ...(geography
            ? {
                baselineLocalCatalog: geography.baselineLocalCatalog,
                sourceEligibleTotal: geography.sourceEligibleTotal,
                countries: geography.sources.map((source) => ({
                  country: source.country,
                  eligible: source.places.length,
                  textSha256: source.source.textSha256,
                })),
              }
            : {}),
        },
        null,
        2,
      ),
    )
    return
  }
  // Every remote write gate executes before connecting. 6A-1 never invokes this branch.
  if (!audit.readyForRollout)
    throw new Error('Rollout source is incomplete; resolve the offline migration audit blockers first.')
  const config = stagingTarget(process.env, values['project-ref'], values.confirm, action as StagingAction)
  const ca = process.env.ROLLCALL_STAGING_DATABASE_CA_FILE
  if (ca) config.ssl = { rejectUnauthorized: true, ca: await readFile(ca, 'utf8') }
  const keys = action === 'provision-keys' ? await readStagingKeys() : null
  const client = new pg.Client(config)
  try {
    await client.connect()
    await client.query("set statement_timeout='180s'; set lock_timeout='10s'")
    await client.query('select pg_advisory_lock($1,$2)', [82631, 61])
    const schema = await client.query(
      "select to_regprocedure('public.my_account_status()') is not null as status,to_regclass('private.staging_provisioning') is not null as provisioning",
    )
    if (!schema.rows[0]?.status || !schema.rows[0]?.provisioning)
      throw new Error(
        'Apply and verify all reviewed staging migrations before reference data or secret operations.',
      )
    if (action === 'catalog') console.log(JSON.stringify(await initializeStagingCatalog(client)))
    else if (action === 'geography' && geography) {
      for (const source of geography.sources) {
        const imported = await importCountry(client, source.country, source.places)
        const counts = await client.query(
          `select count(*)::int total,count(*) filter(where external_source=$2)::int geonames,
          (select count(*)::int from public.city_aliases a join public.cities c on c.id=a.city_id
           where c.country_id=(select id from public.countries where iso_code=$1)) aliases
          from public.cities where country_id=(select id from public.countries where iso_code=$1)`,
          [source.country, 'geonames'],
        )
        console.log(
          JSON.stringify({
            country: source.country,
            sourceEligible: source.places.length,
            imported,
            target: counts.rows[0],
          }),
        )
      }
      await client.query('analyze public.cities; analyze public.city_aliases')
    } else if (action === 'provision-keys' && keys)
      console.log(JSON.stringify(await provisionStagingKeys(client, keys)))
    else if (action === 'bootstrap') {
      await bootstrapStagingAccount(client, values['user-id']!)
      console.log(
        'Staging superadmin provisioned through the checked operator function and audited. No identity was printed.',
      )
    }
  } finally {
    await client.end()
  }
}
main().catch(() => {
  console.error(
    'Staging preparation refused or failed. Check reviewed target, enable/confirmation gates, source audit, migration prerequisites, inputs and private operator configuration. Credentials and database errors are suppressed.',
  )
  process.exitCode = 1
})
