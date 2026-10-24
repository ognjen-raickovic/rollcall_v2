import { POPULATED_PLACE_CODES } from './config.js'
import type { CountryCode } from './config.js'

export type PlaceRecord = {
  external_source_id: string
  name: string
  ascii_name: string | null
  aliases: string[]
  administrative_division: string | null
  admin1_code: string | null
  admin2_code: string | null
  latitude: number
  longitude: number
  population: string
  feature_code: string
  source_modified_at: string
}

export type ParseStats = {
  total: number
  excludedClass: number
  excludedFeatureCode: Record<string, number>
  wrongCountry: number
  invalid: number
  duplicateSourceIds: number
  invalidAliases: number
  eligible: number
}

function validText(value: string, maximum = 200): boolean {
  return (
    value.length > 0 &&
    [...value].length <= maximum &&
    ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
}

function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}

function decimal(value: string, minimum: number, maximum: number): number | undefined {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return undefined
  const result = Number(value)
  return Number.isFinite(result) && result >= minimum && result <= maximum ? result : undefined
}

export function parseCountry(
  text: string,
  country: CountryCode,
): { places: PlaceRecord[]; stats: ParseStats } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
  const stats: ParseStats = {
    total: 0,
    excludedClass: 0,
    excludedFeatureCode: {},
    wrongCountry: 0,
    invalid: 0,
    duplicateSourceIds: 0,
    invalidAliases: 0,
    eligible: 0,
  }
  const admin1 = new Map<string, string>()
  const admin2 = new Map<string, string>()
  // Resolve administrative display names using only records in this country extract.
  for (const line of lines) {
    const fields = line.split('\t')
    const [name, featureClass, code, sourceCountry, first, second] = [
      fields[1]?.trim(),
      fields[6],
      fields[7],
      fields[8],
      fields[10],
      fields[11],
    ]
    if (
      fields.length !== 19 ||
      sourceCountry !== country ||
      featureClass !== 'A' ||
      !name ||
      !validText(name)
    )
      continue
    if (code === 'ADM1' && first) admin1.set(first, name)
    if (code === 'ADM2' && first && second) admin2.set(`${first}.${second}`, name)
  }
  const records = new Map<string, PlaceRecord>()
  for (const line of lines) {
    stats.total++
    const fields = line.split('\t')
    if (fields.length !== 19) {
      stats.invalid++
      continue
    }
    if (fields[8] !== country) {
      stats.wrongCountry++
      continue
    }
    if (fields[6] !== 'P') {
      stats.excludedClass++
      continue
    }
    const featureCode = fields[7] ?? ''
    if (!POPULATED_PLACE_CODES.has(featureCode)) {
      stats.excludedFeatureCode[featureCode] = (stats.excludedFeatureCode[featureCode] ?? 0) + 1
      continue
    }
    const id = fields[0] ?? ''
    const name = fields[1]?.trim() ?? ''
    const asciiName = fields[2]?.trim() ?? ''
    const latitude = decimal(fields[4] ?? '', -90, 90)
    const longitude = decimal(fields[5] ?? '', -180, 180)
    const population = fields[14] ?? ''
    const modified = fields[18] ?? ''
    const first = fields[10]?.trim() || null
    const second = fields[11]?.trim() || null
    if (
      !/^[1-9]\d*$/.test(id) ||
      !Number.isSafeInteger(Number(id)) ||
      !validText(name) ||
      (asciiName !== '' && !validText(asciiName)) ||
      latitude === undefined ||
      longitude === undefined ||
      !/^\d+$/.test(population) ||
      BigInt(population) > 9223372036854775807n ||
      !validDate(modified) ||
      (first !== null && !validText(first, 20)) ||
      (second !== null && !validText(second, 80))
    ) {
      stats.invalid++
      continue
    }
    const aliases = new Set<string>()
    for (const alias of [asciiName, ...(fields[3] ?? '').split(',')]) {
      const value = alias.trim()
      if (!value) continue
      if (!validText(value)) {
        stats.invalidAliases++
        continue
      }
      if (value !== name) aliases.add(value)
    }
    const regions = [
      ...new Set(
        [
          first && second ? admin2.get(`${first}.${second}`) : undefined,
          first ? admin1.get(first) : undefined,
        ].filter((value): value is string => Boolean(value)),
      ),
    ]
    const combined = regions.join(', ')
    const administrativeDivision = combined && [...combined].length <= 200 ? combined : (regions[0] ?? null)
    const record: PlaceRecord = {
      external_source_id: id,
      name,
      ascii_name: asciiName || null,
      aliases: [...aliases].sort(),
      administrative_division: administrativeDivision,
      admin1_code: first,
      admin2_code: second,
      latitude,
      longitude,
      population: BigInt(population).toString(),
      feature_code: featureCode,
      source_modified_at: modified,
    }
    const existing = records.get(id)
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(record)) {
        throw new Error(
          `${country}: conflicting duplicate GeoNames source ID ${id}; no country import was attempted.`,
        )
      }
      stats.duplicateSourceIds++
    } else records.set(id, record)
  }
  const places = [...records.values()].sort(
    (a, b) => Number(a.external_source_id) - Number(b.external_source_id),
  )
  stats.eligible = places.length
  return { places, stats }
}
