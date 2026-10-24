import assert from 'node:assert/strict'
import { test } from 'node:test'
import { strToU8, zipSync } from 'fflate'
import { parseCountry } from '../scripts/geography/parse.js'
import { decodeCountryZip } from '../scripts/geography/source.js'
import { validateLocalDatabaseUrl } from '../scripts/geography/store.js'

// These are small synthetic GeoNames-format test records, not an import dataset.
function fixture(overrides: Record<number, string> = {}): string {
  const fields = [
    '3189073',
    'Čačak',
    'Cacak',
    'Чачак,Cacak,Čačak',
    '43.89139',
    '20.34972',
    'P',
    'PPLA2',
    'RS',
    '',
    'SE',
    '17',
    '',
    '',
    '71883',
    '',
    '231',
    'Europe/Belgrade',
    '2026-01-01',
  ]
  for (const [index, value] of Object.entries(overrides)) fields[Number(index)] = value
  return fields.join('\t')
}

test('GeoNames parser handles supported countries, real names and small populated localities', () => {
  for (const [country, name] of [
    ['ME', 'Nikšić'],
    ['RS', 'Čačak'],
    ['BA', 'Mostar'],
    ['HR', 'Ozalj'],
  ] as const) {
    const parsed = parseCountry(fixture({ 1: name, 7: 'PPLL', 8: country }), country)
    assert.equal(parsed.stats.eligible, 1)
    assert.equal(parsed.places[0]?.name, name)
    assert.equal(parsed.places[0]?.external_source_id, '3189073')
  }
})

test('parser retains source aliases, ASCII names and exact bigint population without inventing transliterations', () => {
  const parsed = parseCountry(fixture({ 14: '9223372036854775807', 3: 'Чачак,Cacak,Čačak,Cacak' }), 'RS')
  const record = parsed.places[0]
  assert.equal(record?.population, '9223372036854775807')
  assert.equal(record?.ascii_name, 'Cacak')
  assert.deepEqual(record?.aliases, ['Cacak', 'Чачак'])
  assert.equal(record?.source_modified_at, '2026-01-01')
})

test('administrative display names are resolved from the same country extract', () => {
  const first = fixture({ 0: '100', 1: 'Central Serbia', 6: 'A', 7: 'ADM1', 11: '' })
  const second = fixture({ 0: '101', 1: 'Moravica', 6: 'A', 7: 'ADM2' })
  const parsed = parseCountry([first, second, fixture()].join('\n'), 'RS')
  assert.equal(parsed.places[0]?.administrative_division, 'Moravica, Central Serbia')
  assert.equal(parsed.places[0]?.admin1_code, 'SE')
  assert.equal(parsed.places[0]?.admin2_code, '17')
  assert.equal(parsed.stats.excludedClass, 2)
})

test('inappropriate feature codes and countries are counted rather than imported', () => {
  const rows = [
    fixture({ 7: 'PPLH' }),
    fixture({ 7: 'PPLQ' }),
    fixture({ 7: 'PPLW' }),
    fixture({ 7: 'PPLX' }),
    fixture({ 7: 'PPLS' }),
    fixture({ 7: 'PPLCH' }),
    fixture({ 8: 'HR' }),
    fixture({ 6: 'S' }),
  ]
  const result = parseCountry(rows.join('\n'), 'RS')
  assert.equal(result.stats.eligible, 0)
  assert.equal(result.stats.wrongCountry, 1)
  assert.equal(result.stats.excludedClass, 1)
  assert.deepEqual(result.stats.excludedFeatureCode, {
    PPLH: 1,
    PPLQ: 1,
    PPLW: 1,
    PPLX: 1,
    PPLS: 1,
    PPLCH: 1,
  })
})

test('invalid fields are rejected and duplicate source identities are deterministic', () => {
  const invalid = [
    'not\ta\tcomplete\trecord',
    fixture({ 0: '-1' }),
    fixture({ 0: '9007199254740992' }),
    fixture({ 1: '' }),
    fixture({ 1: 'x'.repeat(201) }),
    fixture({ 4: '91' }),
    fixture({ 5: '-181' }),
    fixture({ 14: '-1' }),
    fixture({ 14: '9223372036854775808' }),
    fixture({ 18: '2026-02-30' }),
    fixture({ 18: 'not-a-date' }),
  ]
  const result = parseCountry([...invalid, fixture(), fixture()].join('\n'), 'RS')
  assert.equal(result.stats.invalid, invalid.length)
  assert.equal(result.stats.duplicateSourceIds, 1)
  assert.equal(result.stats.eligible, 1)
  assert.throws(
    () => parseCountry([fixture(), fixture({ 1: 'Different name' })].join('\n'), 'RS'),
    /conflicting duplicate/,
  )
})

test('ZIP loading accepts only the expected bounded country entry', () => {
  const archive = zipSync({
    'RS.txt': strToU8(fixture()),
    '../outside.txt': strToU8('must not be extracted'),
  })
  assert.equal(new TextDecoder().decode(decodeCountryZip(archive, 'RS')), fixture())
  assert.throws(
    () => decodeCountryZip(zipSync({ 'nested/RS.txt': strToU8(fixture()) }), 'RS'),
    /must contain/,
  )
  assert.throws(() => decodeCountryZip(archive, 'ME'), /must contain/)
})

test('maintenance imports accept local PostgreSQL only without exposing rejected credentials', () => {
  const valid = 'postgresql://user:secret@127.0.0.1:55322/postgres'
  assert.equal(validateLocalDatabaseUrl(valid), valid)
  for (const url of [
    undefined,
    'https://127.0.0.1:55322',
    'postgresql://user:secret@remote.example/db',
    'postgresql://localhost/db?host=remote.example',
    'postgresql://localhost/db?service=remote',
  ]) {
    assert.throws(
      () => validateLocalDatabaseUrl(url),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.ok(!error.message.includes('secret'))
        return true
      },
    )
  }
})
