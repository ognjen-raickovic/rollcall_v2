import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { insertAuthFixture } from './registration-fixture.js'
import { initializeStagingCatalog } from '../../scripts/staging/catalog.js'
import { provisionStagingKeys } from '../../scripts/staging/keys.js'
import { importCountry } from '../../scripts/geography/store.js'
import type { PlaceRecord } from '../../scripts/geography/parse.js'
import { bootstrapStagingAccount } from '../../scripts/staging/bootstrap.js'

// This suite must never target the populated local database or any hosted database.
const enabled = process.env.ROLLCALL_DISPOSABLE_STAGING_TEST === 'true'
test(
  'disposable staging bootstrap rejects unconfirmed, suspended, concurrent suspension and repeat initialization',
  { skip: !enabled, timeout: 15000 },
  async () => {
    const url = new URL(process.env.GEOGRAPHY_DATABASE_URL ?? '')
    assert.ok(
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.port === '60322' && !url.search,
    )
    const client = new pg.Client({
      connectionString: url.href,
      application_name: 'rollcall-staging-bootstrap-test',
    })
    const blocker = new pg.Client({ connectionString: url.href })
    const confirmed = randomUUID(),
      unconfirmed = randomUUID()
    await client.connect()
    await blocker.connect()
    try {
      await insertAuthFixture(client, confirmed, `staging-${confirmed}@example.test`, true)
      await insertAuthFixture(client, unconfirmed, `staging-${unconfirmed}@example.test`, false)
      await assert.rejects(bootstrapStagingAccount(client, unconfirmed), /confirmed account/)
      await blocker.query('begin; select pg_advisory_xact_lock_shared(82631,51)')
      const pending = bootstrapStagingAccount(client, confirmed).then(
        () => null,
        (error: unknown) => error,
      )
      let waiting = false
      for (let attempt = 0; attempt < 100; attempt++) {
        waiting = (
          await blocker.query(
            "select exists(select 1 from pg_stat_activity where application_name='rollcall-staging-bootstrap-test' and wait_event='advisory') waiting",
          )
        ).rows[0].waiting
        if (waiting) break
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      assert.equal(waiting, true, 'Bootstrap must wait for the existing role/status transaction')
      await blocker.query(
        "insert into private.account_suspensions(profile_id,status,suspended_at,suspended_by,suspension_reason) values($1,'suspended',now(),$2,'Disposable race fixture')",
        [confirmed, unconfirmed],
      )
      await blocker.query('commit')
      const rejected = await pending
      assert.ok(rejected instanceof Error && rejected.message.includes('suspended'))
      assert.equal(
        (await client.query("select count(*)::int total from private.role_audit where action='bootstrap'"))
          .rows[0].total,
        0,
      )
      await assert.rejects(bootstrapStagingAccount(client, confirmed), /suspended/)
      await client.query('delete from private.account_suspensions where profile_id=$1', [confirmed])
      await bootstrapStagingAccount(client, confirmed)
      assert.equal(
        (await client.query('select role from private.account_roles where profile_id=$1', [confirmed]))
          .rows[0].role,
        'superadmin',
      )
      assert.equal(
        (
          await client.query(
            "select count(*)::int total from private.role_audit where action='bootstrap' and target_id=$1",
            [confirmed],
          )
        ).rows[0].total,
        1,
      )
      await assert.rejects(bootstrapStagingAccount(client, confirmed), /already completed/)
    } finally {
      await blocker.query('rollback')
      await blocker.end()
      await client.query('delete from auth.users where id=any($1::uuid[])', [[confirmed, unconfirmed]])
      await client.end()
    }
  },
)
test(
  'disposable staging: repeatable catalog, secret provisioning, RLS and stable import identities',
  { skip: !enabled },
  async () => {
    const url = new URL(process.env.GEOGRAPHY_DATABASE_URL ?? '')
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.port === '60322')
    assert.equal(url.search, '')
    const client = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 })
    await client.connect()
    try {
      const before = await client.query(
        'select (select count(*) from public.games)::int games,(select count(*) from public.cities)::int cities,(select count(*) from auth.users)::int accounts,(select count(*) from public.events)::int events',
      )
      assert.deepEqual(before.rows[0], { games: 0, cities: 0, accounts: 0, events: 0 })
      assert.equal((await initializeStagingCatalog(client)).inserted, 8)
      assert.equal((await initializeStagingCatalog(client)).inserted, 0)
      await client.query("update public.games set name='Operator catalog collision' where id=1")
      await assert.rejects(initializeStagingCatalog(client), /identity conflict/)
      assert.equal(
        (await client.query('select name from public.games where id=1')).rows[0].name,
        'Operator catalog collision',
      )
      await client.query("update public.games set name='Dungeons & Dragons' where id=1")
      const sequence = await client.query(
        "select nextval(pg_get_serial_sequence('public.games','id'))::int value",
      )
      assert.ok(sequence.rows[0].value > 8)
      const keys = {
        cover: randomBytes(32).toString('base64url'),
        invitation: randomBytes(32).toString('base64url'),
      }
      assert.equal((await provisionStagingKeys(client, keys)).alreadyProvisioned, false)
      assert.equal((await provisionStagingKeys(client, keys)).alreadyProvisioned, true)
      await assert.rejects(
        provisionStagingKeys(client, { ...keys, invitation: randomBytes(32).toString('base64url') }),
        /conflict/,
      )
      await assert.rejects(
        provisionStagingKeys(client, { ...keys, cover: randomBytes(32).toString('base64url') }),
        /conflict/,
      )
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const acl = await client.query(
          "select has_table_privilege($1,'private.staging_provisioning','select,insert,update,delete') allowed",
          [role],
        )
        assert.equal(acl.rows[0].allowed, false)
      }
      const protectedTable = await client.query(
        "select relrowsecurity enabled from pg_class where oid='private.staging_provisioning'::regclass",
      )
      assert.equal(protectedTable.rows[0].enabled, true)
      const bucket = await client.query(
        "select public,file_size_limit,allowed_mime_types from storage.buckets where id='event-covers'",
      )
      assert.equal(bucket.rows[0].public, false)
      assert.equal(Number(bucket.rows[0].file_size_limit), 3145728)
      assert.deepEqual([...bucket.rows[0].allowed_mime_types].sort(), [
        'image/jpeg',
        'image/png',
        'image/webp',
      ])
      const helpers = await client.query(
        "select to_regprocedure('storage.allow_only_operation(text)') is not null storage,to_regprocedure('extensions.digest(text,text)') is not null digest,to_regprocedure('public.my_account_status()') is not null suspensions",
      )
      assert.deepEqual(helpers.rows[0], { storage: true, digest: true, suspensions: true })
      const place: PlaceRecord = {
        external_source_id: '999999990',
        name: 'Staging Replay Town',
        ascii_name: 'Staging Replay Town',
        aliases: ['Replay Alias'],
        administrative_division: null,
        admin1_code: null,
        admin2_code: null,
        latitude: 42.4,
        longitude: 19.2,
        population: '10',
        feature_code: 'PPL',
        source_modified_at: '2026-10-24',
      }
      assert.equal((await importCountry(client, 'ME', [place])).inserted, 1)
      const first = await client.query(
        "select id from public.cities where external_source='geonames' and external_source_id=$1",
        [place.external_source_id],
      )
      assert.equal((await importCountry(client, 'ME', [place])).inserted, 0)
      const second = await client.query(
        "select id from public.cities where external_source='geonames' and external_source_id=$1",
        [place.external_source_id],
      )
      assert.equal(first.rows[0].id, second.rows[0].id)
      assert.equal(
        (
          await client.query(
            'select count(*)::int total from public.city_aliases where city_id=$1 and name=$2',
            [first.rows[0].id, 'Replay Alias'],
          )
        ).rows[0].total,
        1,
      )
      await client.query('delete from public.cities where id=$1', [first.rows[0].id])
      const after = await client.query(
        'select (select count(*) from auth.users)::int accounts,(select count(*) from public.events)::int events',
      )
      assert.deepEqual(after.rows[0], { accounts: 0, events: 0 })
    } finally {
      await client.end()
    }
  },
)
