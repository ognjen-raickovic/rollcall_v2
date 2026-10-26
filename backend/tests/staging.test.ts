import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { stagingTarget } from '../scripts/staging/target.js'
import { generateStagingKeys, readStagingKeys } from '../scripts/staging/keys.js'
import { validateStagingGeography } from '../scripts/staging/geography.js'
import { migrationAudit } from '../scripts/staging/audit.js'
import { COUNTRY_CODES, POPULATED_PLACE_CODES } from '../scripts/geography/config.js'
test('staging targets fail closed without independent scope, TLS and explicit write confirmation', () => {
  const ref = 'a'.repeat(20),
    env = {
      ROLLCALL_STAGING_PROJECT_NAME: 'rollcall-dev',
      ROLLCALL_STAGING_PROJECT_REF: ref,
      ROLLCALL_STAGING_SUPABASE_URL: `https://${ref}.supabase.co`,
      ROLLCALL_STAGING_DATABASE_URL: `postgresql://postgres:synthetic-operator-placeholder@db.${ref}.supabase.co:5432/postgres`,
      ROLLCALL_STAGING_WRITES_ENABLED: 'true',
    }
  const config = stagingTarget(env, ref, `staging:${ref}:catalog`, 'catalog')
  assert.equal(config.host, `db.${ref}.supabase.co`)
  assert.deepEqual(config.ssl, { rejectUnauthorized: true })
  assert.equal('connectionString' in config, false)
  for (const changed of [
    { ROLLCALL_STAGING_WRITES_ENABLED: 'false' },
    { ROLLCALL_STAGING_PROJECT_NAME: 'production' },
    { ROLLCALL_STAGING_DATABASE_URL: env.ROLLCALL_STAGING_DATABASE_URL + '?sslmode=disable' },
    { ROLLCALL_STAGING_DATABASE_URL: 'postgresql://postgres:placeholder@127.0.0.1:5432/postgres' },
    { ROLLCALL_STAGING_SUPABASE_URL: `https://${'b'.repeat(20)}.supabase.co` },
    {
      ROLLCALL_STAGING_DATABASE_URL: `postgresql://postgres.${ref}:placeholder@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
    },
  ])
    assert.throws(() => stagingTarget({ ...env, ...changed }, ref, `staging:${ref}:catalog`, 'catalog'))
  assert.throws(() => stagingTarget(env, ref, undefined, 'catalog'))
  assert.throws(() => stagingTarget(env, 'b'.repeat(20), `staging:${ref}:catalog`, 'catalog'))
  const pooled = stagingTarget(
    {
      ...env,
      ROLLCALL_STAGING_DATABASE_URL: `postgresql://postgres.${ref}:placeholder@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    },
    ref,
    `staging:${ref}:geography`,
    'geography',
  )
  assert.equal(pooled.user, `postgres.${ref}`)
})
test('staging key generation is independent, non-overwriting and rejects malformed inputs without echoing them', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rollcall-staging-keys-')),
    file = pathToFileURL(path.join(directory, 'keys.env'))
  try {
    await generateStagingKeys(file)
    const keys = await readStagingKeys(file)
    assert.equal(keys.cover.length, 43)
    assert.equal(keys.invitation.length, 43)
    assert.equal(keys.cover !== keys.invitation, true)
    await assert.rejects(generateStagingKeys(file))
    assert.equal((await readStagingKeys(file)).cover === keys.cover, true)
    await writeFile(file, 'EVENT_COVER_OPERATION_KEY=invalid\nEVENT_INVITATION_KEY=invalid\n')
    await assert.rejects(
      readStagingKeys(file),
      (error) => error instanceof Error && !error.message.includes('=invalid'),
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
test('staging geography dry run validates all countries, exact source checksums and manifest counts offline', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rollcall-staging-geo-'))
  try {
    const countries = []
    for (const country of COUNTRY_CODES) {
      const fields = [
        '990000001',
        'Synthetic fixture',
        'Synthetic fixture',
        'Alternate fixture',
        '42.4',
        '19.2',
        'P',
        'PPL',
        country,
        '',
        '01',
        '',
        '',
        '',
        '100',
        '',
        '',
        'Europe/Podgorica',
        '2026-10-24',
      ]
      const source = fields.join('\t') + '\n'
      await writeFile(path.join(directory, `${country}.txt`), source)
      const sha = createHash('sha256').update(source).digest('hex')
      countries.push({ source: { country, sha256: sha, textSha256: sha }, parse: { eligible: 1 } })
    }
    const manifest = pathToFileURL(path.join(directory, 'manifest.json'))
    await writeFile(
      manifest,
      JSON.stringify({
        license: 'CC BY 4.0',
        includedFeatureCodes: [...POPULATED_PLACE_CODES],
        countries,
        verification: { cityCount: 6, aliasCount: 4 },
      }),
    )
    const checked = await validateStagingGeography(directory, manifest)
    assert.equal(checked.sources.length, 4)
    assert.equal(checked.sourceEligibleTotal, 4)
    assert.equal(checked.baselineLocalCatalog.cityCount, 6)
    await writeFile(path.join(directory, 'ME.txt'), 'changed input')
    await assert.rejects(validateStagingGeography(directory, manifest), /checksum mismatch/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
test('offline migration audit detects the actual missing suspension prerequisite without modifying the branch', async () => {
  const audit = await migrationAudit()
  assert.equal(
    audit.migrations.some((item) => item.file.endsWith('staging_provisioning.sql')),
    true,
  )
  const hasSuspension = audit.migrations.some((item) => item.file.endsWith('account_suspensions.sql'))
  if (!hasSuspension) {
    assert.equal(audit.readyForRollout, false)
    assert.ok(audit.blockers.some((item) => item.includes('5B-2B')))
  }
  assert.ok(audit.migrations.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)))
})
