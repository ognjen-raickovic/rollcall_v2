import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { buildApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createDatabaseClient } from '../../src/db/supabase.js'

test(
  'local invitations: encrypted ownership, atomic admission, lifecycle and bypass-resistant throttling',
  {
    skip: process.env.RUN_LOCAL_INTEGRATION !== 'true',
    timeout: 90000,
  },
  async (t) => {
    const env = loadEnvironment()
    const url = process.env.GEOGRAPHY_DATABASE_URL ?? ''
    assert.equal(
      [env.SUPABASE_URL, url].every((value) =>
        ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname),
      ),
      true,
    )
    const db = new pg.Client({ connectionString: url })
    await db.connect()
    const app = buildApp(env, { logger: false })
    await app.ready()
    const emails: string[] = [],
      ids: string[] = []
    t.after(async () => {
      await app.close()
      await db.query('delete from public.events where host_id=any($1::uuid[])', [ids])
      await db.query('delete from auth.users where email=any($1::text[])', [emails])
      await db.end()
    })
    async function account() {
      const email = `invitation-${randomUUID()}@example.test`
      emails.push(email)
      const auth = createDatabaseClient(env).auth
      const signup = await auth.signUp({ email, password: `Rc!${randomUUID()}aA7` })
      assert.equal(Boolean(signup.error), false)
      const id = signup.data.user?.id
      assert.ok(id)
      ids.push(id)
      const row = await db.query('select confirmation_token from auth.users where id=$1', [id])
      const confirmed = await auth.verifyOtp({ token_hash: row.rows[0].confirmation_token, type: 'signup' })
      const token = confirmed.data.session?.access_token
      assert.ok(token)
      return { id, token }
    }
    const host = await account(),
      a = await account(),
      b = await account(),
      limited = await account()
    async function request(
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      path: string,
      actor = host,
      body?: unknown,
      ip = '127.0.0.1',
    ) {
      return app.inject({
        method,
        url: path,
        remoteAddress: ip,
        headers: {
          authorization: `Bearer ${actor.token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
      })
    }
    async function json(
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      path: string,
      actor = host,
      body?: unknown,
    ) {
      const r = await request(method, path, actor, body)
      assert.equal(r.statusCode, 200, 'Unexpected status; invitation values are never printed.')
      return r.json()
    }
    const game = (await db.query('select id from public.games order by id limit 1')).rows[0].id
    const city = (await db.query('select id from public.cities order by id limit 1')).rows[0].id
    async function event(capacity = 2) {
      const r = await request('POST', '/api/events', host, {
        title: 'Private invitation test',
        description: 'Synthetic private table for secure admission testing.',
        gameId: game,
        cityId: city,
        address: 'Synthetic private test address',
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 90000000).toISOString(),
        capacity,
        experienceLevel: 'all-levels',
        visibility: 'private',
      })
      assert.equal(r.statusCode, 201)
      return r.json().id as string
    }
    const id = await event(),
      base = `/api/events/${id}`
    let active = await json('GET', `${base}/invitation`)
    await t.test(
      'host can recover encrypted codes; outsiders, participants, anonymous and Data API cannot manage them',
      async () => {
        assert.equal(typeof active.code === 'string', true)
        assert.equal((await json('GET', `${base}/invitation`)).code === active.code, true)
        assert.equal((await request('GET', `${base}/invitation`, a)).statusCode, 404)
        assert.equal((await app.inject({ method: 'GET', url: `${base}/invitation` })).statusCode, 401)
        assert.equal((await request('POST', `${base}/invitation/rotate`, a)).statusCode, 404)
        const stored = (
          await db.query('select code_hash,sealed_code from private.event_invitations where event_id=$1', [
            id,
          ])
        ).rows[0]
        assert.equal(JSON.stringify(stored).includes(active.code.replaceAll('-', '')), false)
        const direct = createDatabaseClient(env, fetch, a.token)
        assert.equal(
          Boolean((await direct.rpc('redeem_event_invitation', { p_hash: stored.code_hash })).error),
          true,
        )
        assert.equal(
          (
            await db.query(
              "select pg_has_role('authenticated','rollcall_invitation_executor','member') member",
            )
          ).rows[0].member,
          false,
        )
      },
    )
    await t.test(
      'real membership persists, repeats are idempotent and private address/code permissions differ',
      async () => {
        const joined = await json('POST', '/api/private-events/join', a, { code: active.code.toLowerCase() })
        assert.equal(joined.eventId === id, true)
        await json('POST', '/api/private-events/join', a, { code: active.code })
        const details = await json('GET', base, a)
        assert.equal(details.viewer.hasJoined, true)
        assert.equal('address' in details, true)
        assert.equal('code' in details, false)
        assert.equal((await request('GET', `${base}/invitation`, a)).statusCode, 404)
        assert.equal(
          (await db.query('select participant_count from public.events where id=$1', [id])).rows[0]
            .participant_count,
          1,
        )
      },
    )
    await t.test(
      'rotation/revocation/expiry/visibility block new admissions without ejecting members',
      async () => {
        const old = active.code
        active = await json('POST', `${base}/invitation/rotate`)
        assert.equal((await request('POST', '/api/private-events/join', b, { code: old })).statusCode, 400)
        await json('POST', '/api/private-events/join', b, { code: active.code })
        await json('POST', `${base}/invitation/revoke`)
        assert.equal(
          (await request('POST', '/api/private-events/join', b, { code: active.code })).statusCode,
          400,
        )
        assert.equal((await json('GET', base, b)).viewer.hasJoined, true)
        active = await json('POST', `${base}/invitation/rotate`)
        await db.query(
          "update private.event_invitations set expires_at=clock_timestamp()-interval '1 second' where event_id=$1",
          [id],
        )
        assert.equal(
          (await request('POST', '/api/private-events/join', b, { code: active.code })).statusCode,
          400,
        )
        for (const visibility of ['public', 'unlisted']) {
          await json('PATCH', base, host, { visibility })
          assert.equal(
            (await request('POST', '/api/private-events/join', b, { code: active.code })).statusCode,
            400,
          )
        }
        await json('PATCH', base, host, { visibility: 'private' })
        active = await json('POST', `${base}/invitation/rotate`)
        await json('DELETE', `${base}/attendees/me`, b)
        assert.equal((await request('GET', base, b)).statusCode, 404)
      },
    )
    await t.test(
      'independent PostgreSQL admissions serialize the final seat and rotation waits on the same event lock',
      async () => {
        const last = await event(1),
          invitation = await json('GET', `/api/events/${last}/invitation`)
        const results = await Promise.all([
          request('POST', '/api/private-events/join', a, { code: invitation.code }),
          request('POST', '/api/private-events/join', b, { code: invitation.code }),
        ])
        assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 400])
        assert.equal(
          (await db.query('select participant_count from public.events where id=$1', [last])).rows[0]
            .participant_count,
          1,
        )
        for (const action of ['rotate', 'revoke']) {
          const race = await event(2),
            before = await json('GET', `/api/events/${race}/invitation`)
          await db.query('begin')
          await db.query('select id from public.events where id=$1 for update', [race])
          const redeem = request('POST', '/api/private-events/join', a, { code: before.code })
          const rotate = request('POST', `/api/events/${race}/invitation/${action}`)
          try {
            let blocked = 0
            const deadline = Date.now() + 4000
            while (blocked < 2 && Date.now() < deadline) {
              await db.query('select pg_stat_clear_snapshot()')
              blocked = Number(
                (
                  await db.query(
                    "select count(*) n from pg_stat_activity where wait_event_type='Lock' and (query like '%redeem_event_invitation%' or query like '%manage_event_invitation%')",
                  )
                ).rows[0].n,
              )
              if (blocked < 2) await new Promise((resolve) => setTimeout(resolve, 25))
            }
            assert.equal(
              blocked >= 2,
              true,
              'Admission and invitation change must actually wait on PostgreSQL locks.',
            )
          } finally {
            await db.query('commit')
          }
          const [admission, rotation] = await Promise.all([redeem, rotate])
          assert.equal(rotation.statusCode, 200)
          assert.equal([200, 400].includes(admission.statusCode), true)
          if (action === 'rotate')
            assert.equal(
              (await request('POST', '/api/private-events/join', b, { code: before.code })).statusCode,
              400,
            )
          assert.equal(
            (await request('POST', '/api/private-events/join', host, { code: rotation.json().code }))
              .statusCode,
            400,
          )
        }
      },
    )
    await t.test('cancellation blocks admission and deletion cascades invitation records', async () => {
      const cancelled = await event(),
        invitation = await json('GET', `/api/events/${cancelled}/invitation`)
      await json('PATCH', `/api/events/${cancelled}`, host, { status: 'cancelled' })
      assert.equal(
        (await request('POST', '/api/private-events/join', b, { code: invitation.code })).statusCode,
        400,
      )
      assert.equal((await request('DELETE', `/api/events/${cancelled}`)).statusCode, 204)
      assert.equal(
        (
          await db.query('select count(*)::integer n from private.event_invitations where event_id=$1', [
            cancelled,
          ])
        ).rows[0].n,
        0,
      )
    })
    await t.test(
      'invalid attempts commit account limits and changing forwarded headers cannot evade IP throttling',
      async () => {
        for (let i = 0; i < 20; i++)
          assert.equal(
            (
              await request(
                'POST',
                '/api/private-events/join',
                limited,
                { code: '2222222222222222' },
                '127.0.0.2',
              )
            ).statusCode,
            400,
          )
        assert.equal(
          (
            await request(
              'POST',
              '/api/private-events/join',
              limited,
              { code: '2222222222222222' },
              '127.0.0.2',
            )
          ).statusCode,
          429,
        )
        for (let i = 0; i < 31; i++) {
          const r = await app.inject({
            method: 'POST',
            url: '/api/private-events/join',
            remoteAddress: '127.0.0.3',
            headers: { authorization: `Bearer ${b.token}`, 'x-forwarded-for': `198.51.100.${i}` },
            payload: { code: 'bad' },
          })
          assert.equal(r.statusCode, i === 30 ? 429 : 400)
        }
      },
    )
  },
)
