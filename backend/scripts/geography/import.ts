import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import pg from 'pg'
import { COUNTRY_CODES, POPULATED_PLACE_CODES } from './config.js'
import { parseCountry } from './parse.js'
import { loadCountrySource } from './source.js'
import { importCountry, validateLocalDatabaseUrl } from './store.js'

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      directory: { type: 'string', default: '.tmp/geonames' },
      download: { type: 'boolean', default: false },
      refresh: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      report: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  })
  if (values.help) {
    console.log(
      'geography:import [--directory .tmp/geonames] [--download] [--refresh] [--dry-run] [--report path]',
    )
    console.log('Uses ME/RS/BA/HR country files only. Local XX.txt takes precedence over cached XX.zip.')
    console.log(
      'Downloads fill missing files; --refresh explicitly refetches ZIPs. Database imports require GEOGRAPHY_DATABASE_URL targeting loopback PostgreSQL.',
    )
    return
  }
  if (values.refresh && !values.download) throw new Error('--refresh requires --download.')
  const directory = path.resolve(values.directory)
  const reportFile = path.resolve(values.report ?? path.join(directory, 'import-report.json'))
  const sources = []
  // Validate every country input before connecting or writing any database rows.
  for (const country of COUNTRY_CODES) {
    const source = await loadCountrySource(directory, country, {
      download: values.download,
      refresh: values.refresh,
    })
    const parsed = parseCountry(source.text, country)
    if (!parsed.places.length)
      throw new Error(`${country}: no eligible populated places; database not changed.`)
    sources.push({ country, source: source.info, ...parsed })
  }
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: values['dry-run'],
    source: 'GeoNames country extracts',
    license: 'CC BY 4.0',
    attribution: 'https://www.geonames.org/',
    featureClass: 'P',
    includedFeatureCodes: [...POPULATED_PLACE_CODES],
    updatePolicy:
      'Per-country transactional upsert; stable IDs; additive aliases; no deletions; older source rows skipped.',
    countries: [] as Record<string, unknown>[],
  }
  if (values['dry-run']) {
    for (const source of sources) report.countries.push({ source: source.source, parse: source.stats })
  } else {
    const connectionString = validateLocalDatabaseUrl(process.env.GEOGRAPHY_DATABASE_URL)
    const client = new pg.Client({
      connectionString,
      connectionTimeoutMillis: 10000,
      application_name: 'rollcall-geography-import',
    })
    try {
      await client.connect()
      for (const source of sources) {
        const imported = await importCountry(client, source.country, source.places)
        report.countries.push({ source: source.source, parse: source.stats, imported })
        console.log(
          `${source.country}: eligible=${source.stats.eligible}, inserted=${imported.inserted}, adopted=${imported.adoptedSeeds}, updated=${imported.updated}, unchanged=${imported.unchanged}, aliases added=${imported.aliasesInserted}, ambiguous seeds=${imported.ambiguousSeeds}`,
        )
      }
      await client.query('analyze public.cities; analyze public.city_aliases')
    } finally {
      await client.end()
    }
  }
  await mkdir(path.dirname(reportFile), { recursive: true })
  await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  console.log(`Report written to ${reportFile}`)
}

main().catch((error: unknown) => {
  // Never print pg errors/connection strings: they can include credentials or internals.
  if (
    error instanceof Error &&
    (error.message.startsWith('ME:') ||
      error.message.startsWith('RS:') ||
      error.message.startsWith('BA:') ||
      error.message.startsWith('HR:') ||
      error.message.startsWith('GEOGRAPHY_DATABASE_URL') ||
      error.message.startsWith('Configure GEOGRAPHY_') ||
      error.message.startsWith('--refresh'))
  )
    console.error(error.message)
  else
    console.error(
      'Geographic import failed. Check the local database/migrations, input files and network; connection details are suppressed.',
    )
  process.exitCode = 1
})
