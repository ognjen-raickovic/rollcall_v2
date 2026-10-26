import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { COUNTRY_CODES, POPULATED_PLACE_CODES } from '../geography/config.js'
import { loadCountrySource } from '../geography/source.js'
import { parseCountry } from '../geography/parse.js'
import { repositoryRoot } from './audit.js'
export async function validateStagingGeography(
  directory: string,
  manifestFile: URL = new URL('docs/geographic-dataset-manifest.json', repositoryRoot),
) {
  const manifest = z
    .object({
      license: z.literal('CC BY 4.0'),
      includedFeatureCodes: z.array(z.string()),
      countries: z
        .array(
          z.object({
            source: z.object({
              country: z.enum(COUNTRY_CODES),
              sha256: z.string().regex(/^[a-f0-9]{64}$/),
              textSha256: z.string().regex(/^[a-f0-9]{64}$/),
            }),
            parse: z.object({ eligible: z.number().int().positive() }),
          }),
        )
        .length(4),
      verification: z.object({ cityCount: z.number().int(), aliasCount: z.number().int() }),
    })
    .parse(JSON.parse(await readFile(manifestFile, 'utf8')))
  if (
    new Set(manifest.countries.map((item) => item.source.country)).size !== 4 ||
    [...POPULATED_PLACE_CODES].sort().join() !== manifest.includedFeatureCodes.toSorted().join()
  )
    throw new Error('Review the geographic manifest scope/filter policy before importing.')
  const sources = []
  for (const country of COUNTRY_CODES) {
    const expected = manifest.countries.find((item) => item.source.country === country)
    const loaded = await loadCountrySource(directory, country, { download: false, refresh: false })
    if (
      !expected ||
      loaded.info.textSha256 !== expected.source.textSha256 ||
      (loaded.info.file.endsWith('.zip') && loaded.info.sha256 !== expected.source.sha256)
    )
      throw new Error(`${country}: reviewed source checksum mismatch. No database connection was made.`)
    const parsed = parseCountry(loaded.text, country)
    if (parsed.places.length !== expected.parse.eligible)
      throw new Error(
        `${country}: eligible counts differ from the reviewed parser/manifest; review before writing.`,
      )
    sources.push({ country, source: loaded.info, places: parsed.places, stats: parsed.stats })
  }
  return {
    sources,
    baselineLocalCatalog: manifest.verification,
    sourceEligibleTotal: sources.reduce((total, item) => total + item.places.length, 0),
  }
}
