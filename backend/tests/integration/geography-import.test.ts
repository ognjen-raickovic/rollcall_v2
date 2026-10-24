import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import pg from 'pg'
import { parseCountry } from '../../scripts/geography/parse.js'
import { importCountry, validateLocalDatabaseUrl } from '../../scripts/geography/store.js'

// Test-only source identifiers/metadata; these are never loaded into the application DB.
function fixture(id: number, name: string, country: string, aliases = '') {
  return [
    id,
    name,
    name,
    aliases,
    '42',
    '19',
    'P',
    'PPL',
    country,
    '',
    '01',
    '001',
    '',
    '',
    '100',
    '',
    '',
    'Europe/Belgrade',
    '2026-01-01',
  ].join('\t')
}

test(
  'local importer transactions preserve references, IDs and manual data across reruns and failures',
  {
    skip:
      process.env.RUN_LOCAL_INTEGRATION === 'true'
        ? false
        : 'Requires opt-in and local GEOGRAPHY_DATABASE_URL.',
  },
  async () => {
    const connectionString = validateLocalDatabaseUrl(process.env.GEOGRAPHY_DATABASE_URL)
    const admin = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 })
    const database = `rollcall_import_test_${randomUUID().replaceAll('-', '')}`
    assert.match(database, /^rollcall_import_test_[a-f0-9]{32}$/)
    await admin.connect()
    let client: pg.Client | undefined
    let created = false
    try {
      // A separate database avoids resets or fixture writes in the developer's app data.
      await admin.query(`create database "${database}"`)
      created = true
      const target = new URL(connectionString)
      target.pathname = `/${database}`
      client = new pg.Client({ connectionString: target.toString(), connectionTimeoutMillis: 5000 })
      await client.connect()
      await client.query('create schema auth; create table auth.users(id uuid primary key)')
      const migrationDirectory = new URL('../../../supabase/migrations/', import.meta.url)
      for (const file of (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort()) {
        await client.query(await readFile(new URL(file, migrationDirectory), 'utf8'))
      }
      await client.query(await readFile(new URL('../../../supabase/seed.sql', import.meta.url), 'utf8'))
      const original = await client.query<{ id: number; created_at: Date }>(
        "select id,created_at from public.cities where name='Podgorica'",
      )
      const originalCity = original.rows[0]
      assert.ok(originalCity)
      const profileId = randomUUID()
      await client.query('insert into auth.users(id) values($1)', [profileId])
      await client.query(
        `insert into public.profiles(id,display_name,country_id,city_id)
      select $1,'Import reference fixture',country_id,id from public.cities where id=$2`,
        [profileId, originalCity.id],
      )
      const records = parseCountry(fixture(900000001, 'Podgorica', 'ME', 'Titograd,Подгорица'), 'ME').places
      const first = await importCountry(client, 'ME', records)
      assert.equal(first.adoptedSeeds, 1)
      assert.equal(first.inserted, 0)
      const adopted = await client.query(
        'select id,created_at from public.cities where external_source_id=$1',
        ['900000001'],
      )
      assert.equal(adopted.rows[0].id, originalCity.id)
      assert.equal(adopted.rows[0].created_at.toISOString(), originalCity.created_at.toISOString())
      assert.equal(
        (await client.query('select city_id from public.profiles where id=$1', [profileId])).rows[0].city_id,
        originalCity.id,
      )
      await client.query(
        `insert into public.city_aliases(city_id,country_id,name,source)
      select id,country_id,'Manual preserved alias','manual' from public.cities where id=$1`,
        [originalCity.id],
      )
      const repeated = await importCountry(client, 'ME', records)
      assert.equal(repeated.inserted, 0)
      assert.equal(repeated.updated, 0)
      assert.equal(repeated.unchanged, 1)
      assert.equal(repeated.aliasesInserted, 0)
      assert.equal(
        (await client.query("select count(*)::int n from public.city_aliases where source='manual'")).rows[0]
          .n,
        1,
      )

      for (const [country, name, id] of [
        ['RS', 'Čačak', 900000002],
        ['BA', 'Mostar', 900000003],
        ['HR', 'Zagreb', 900000004],
      ] as const) {
        const parsed = parseCountry(fixture(id, name, country), country).places
        assert.equal((await importCountry(client, country, parsed)).adoptedSeeds, 1)
        assert.equal((await importCountry(client, country, parsed)).unchanged, 1)
      }
      const updated = records.map((record) => ({
        ...record,
        name: 'Podgorica updated fixture',
        source_modified_at: '2026-02-01',
      }))
      assert.equal((await importCountry(client, 'ME', updated)).updated, 1)
      assert.equal((await importCountry(client, 'ME', records)).staleSourceRows, 1)
      assert.equal(
        (await client.query('select name from public.cities where id=$1', [originalCity.id])).rows[0].name,
        'Podgorica updated fixture',
      )
      await assert.rejects(() => importCountry(client as pg.Client, 'RS', updated), /different country/)
      assert.equal(
        (await client.query('select country_id from public.cities where id=$1', [originalCity.id])).rows[0]
          .country_id,
        (await client.query("select id from public.countries where iso_code='ME'")).rows[0].id,
      )

      const before = (await client.query('select count(*)::int n from public.cities')).rows[0].n
      const valid = parseCountry(fixture(900000010, 'Small settlement fixture', 'ME'), 'ME').places[0]
      assert.ok(valid)
      await assert.rejects(() =>
        importCountry(client as pg.Client, 'ME', [
          valid,
          {
            ...valid,
            external_source_id: '900000011',
            name: 'Invalid coordinate fixture',
            latitude: 91,
          },
        ]),
      )
      assert.equal((await client.query('select count(*)::int n from public.cities')).rows[0].n, before)
      assert.equal(
        (await client.query("select count(*)::int n from public.cities where external_source_id='900000010'"))
          .rows[0].n,
        0,
      )

      const ambiguous = parseCountry(
        [fixture(900000020, 'Bar', 'ME'), fixture(900000021, 'Other Bar fixture', 'ME', 'Bar')].join('\n'),
        'ME',
      ).places
      assert.equal((await importCountry(client, 'ME', ambiguous)).ambiguousSeeds, 1)
      assert.equal(
        (
          await client.query(
            "select count(*)::int n from public.cities where name='Bar' and external_source is null",
          )
        ).rows[0].n,
        1,
      )
    } finally {
      await client?.end()
      if (created) await admin.query(`drop database "${database}"`)
      await admin.end()
    }
  },
)
