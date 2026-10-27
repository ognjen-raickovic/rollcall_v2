import { signUpFixture } from './registration-fixture.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { buildApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createDatabaseClient } from '../../src/db/supabase.js'
test(
  'local event reporting, private boundaries, moderation audits and real cancellation concurrency',
  {
    skip: process.env.RUN_LOCAL_INTEGRATION !== 'true',
    timeout: 120000,
  },
  async (t) => {
    const env = loadEnvironment(),
      url = process.env.GEOGRAPHY_DATABASE_URL ?? ''
    assert.ok(
      [url, env.SUPABASE_URL].every((value) =>
        ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname),
      ),
    )
    const db = new pg.Client({ connectionString: url })
    await db.connect()
    const app = buildApp(env, { logger: false })
    await app.ready()
    const ids: string[] = [],
      events: string[] = [],
      reports: string[] = []
    t.after(async () => {
      await app.close()
      await db.query('begin')
      try {
        await db.query("set local session_replication_role='replica'")
        await db.query('delete from private.moderation_audit where report_id=any($1::uuid[])', [reports])
        await db.query('delete from private.role_audit where target_id=any($1::uuid[])', [ids])
        await db.query('delete from private.event_reports where reporter_id=any($1::uuid[])', [ids])
        await db.query('commit')
      } catch (error) {
        await db.query('rollback')
        throw error
      }
      await db.query('delete from public.events where id=any($1::uuid[])', [events])
      await db.query('delete from auth.users where id=any($1::uuid[])', [ids])
      await db.end()
    })
    async function account(role?: 'admin' | 'superadmin') {
      const auth = createDatabaseClient(env).auth,
        result = await signUpFixture(auth, db, {
          email: `moderation-${randomUUID()}@example.test`,
          password: `Rc!${randomUUID()}aA7`,
        })
      const id = result.data.user?.id
      assert.ok(id)
      ids.push(id)
      const hash = (await db.query('select confirmation_token from auth.users where id=$1', [id])).rows[0]
        .confirmation_token
      const confirmed = await auth.verifyOtp({ token_hash: hash, type: 'signup' }),
        token = confirmed.data.session?.access_token
      assert.ok(token)
      if (role) await db.query('insert into private.account_roles(profile_id,role) values($1,$2)', [id, role])
      return { id, token }
    }
    const host = await account(),
      reporter = await account(),
      outsider = await account(),
      admin = await account('admin'),
      root = await account('superadmin'),
      limited = await account()
    type Actor = typeof host
    async function request(
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      path: string,
      actor: Actor | undefined = reporter,
      body?: unknown,
    ) {
      return app.inject({
        method,
        url: path,
        headers: {
          ...(actor ? { authorization: `Bearer ${actor.token}` } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
      })
    }
    const game = (await db.query('select id from public.games order by id limit 1')).rows[0].id,
      city = (await db.query('select id from public.cities order by id limit 1')).rows[0].id
    async function event(visibility = 'public') {
      const response = await request('POST', '/api/events', host, {
        title: 'Moderation test table',
        description: 'Synthetic moderation test event.',
        gameId: game,
        cityId: city,
        address: 'Protected fixture address',
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 90000000).toISOString(),
        capacity: 2,
        experienceLevel: 'all-levels',
        visibility,
      })
      assert.equal(response.statusCode, 201)
      const id = response.json().id
      events.push(id)
      return id as string
    }
    async function report(id: string, actor = reporter) {
      const response = await request('POST', `/api/events/${id}/reports`, actor, {
        reason: 'unsafe',
        description: 'Synthetic safety concern, no personal details.',
      })
      assert.equal(response.statusCode, 201)
      reports.push(response.json().id)
      return response.json().id as string
    }
    const publicEvent = await event(),
      privateEvent = await event('private'),
      unlisted = await event('unlisted')
    await t.test(
      'submission validates identity, access, normalization, duplicates and durable direct-RPC throttles',
      async () => {
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: `/api/events/${publicEvent}/reports`,
              payload: { reason: 'spam' },
            })
          ).statusCode,
          401,
        )
        for (const body of [
          { reason: 'invalid' },
          { reason: 'other', description: 'x'.repeat(1001) },
          { reason: 'other', reporterId: host.id },
        ])
          assert.equal(
            (await request('POST', `/api/events/${publicEvent}/reports`, reporter, body)).statusCode,
            400,
          )
        for (const target of [privateEvent, randomUUID()])
          assert.equal(
            (await request('POST', `/api/events/${target}/reports`, outsider, { reason: 'other' }))
              .statusCode,
            404,
          )
        const id = await report(publicEvent)
        const duplicate = await request('POST', `/api/events/${publicEvent}/reports`, reporter, {
          reason: 'spam',
        })
        assert.equal(duplicate.statusCode, 200)
        assert.deepEqual(duplicate.json(), { id, created: false })
        assert.equal(
          (await db.query('select reporter_id from private.event_reports where id=$1', [id])).rows[0]
            .reporter_id,
          reporter.id,
        )
        await report(unlisted)
        await db.query('insert into public.event_participants(event_id,profile_id) values($1,$2)', [
          privateEvent,
          reporter.id,
        ])
        await report(privateEvent)
        await report(privateEvent, host) // Explicit policy: the private host may also report.
        const direct = createDatabaseClient(env, fetch, limited.token)
        for (let i = 0; i < 10; i++)
          assert.deepEqual(
            (
              await direct.rpc('submit_event_report', {
                p_event_id: privateEvent,
                p_reason: 'other',
                p_description: null,
              })
            ).data,
            { status: 'unavailable' },
          )
        assert.deepEqual(
          (
            await direct.rpc('submit_event_report', {
              p_event_id: publicEvent,
              p_reason: 'other',
              p_description: null,
            })
          ).data,
          { status: 'limited' },
        )
        const throttled = await request('POST', `/api/events/${publicEvent}/reports`, limited, {
          reason: 'other',
        })
        assert.equal(throttled.statusCode, 429)
        assert.equal(throttled.headers['retry-after'], '900')
        assert.equal(
          (
            await db.query('select attempts from private.event_report_attempts where account_id=$1', [
              limited.id,
            ])
          ).rows[0].attempts,
          12,
        )
      },
    )
    await t.test(
      'only current moderators review safe report projections; hosts and direct users cannot inspect reports',
      async () => {
        for (const actor of [reporter, host, outsider])
          assert.equal((await request('GET', '/api/admin/event-reports', actor)).statusCode, 403)
        for (const actor of [admin, root]) {
          const list = await request('GET', '/api/admin/event-reports?status=all&limit=2', actor)
          assert.equal(list.statusCode, 200)
          assert.equal(list.json().items.length, 2)
          assert.ok(list.json().nextCursor)
          const item = list.json().items[0],
            detail = await request('GET', `/api/admin/event-reports/${item.id}`, actor)
          assert.equal(detail.statusCode, 200)
          const text = JSON.stringify(detail.json())
          assert.equal(text.includes('Protected fixture address'), false)
          for (const field of [
            'reporterId',
            'reporter_id',
            'address',
            'host',
            'participants',
            'cover',
            'code',
            'birthYear',
            'email',
          ])
            assert.equal(field in detail.json(), false)
          assert.deepEqual(Object.keys(detail.json().eventContext).sort(), [
            'game',
            'startsAt',
            'title',
            'visibility',
          ])
          assert.equal(list.headers['cache-control'], 'no-store')
          assert.equal((await request('GET', `/api/events/${privateEvent}`, actor)).statusCode, 404)
          assert.equal((await request('GET', `/api/events/${privateEvent}/cover-url`, actor)).statusCode, 404)
          assert.equal(
            (await request('GET', `/api/events/${privateEvent}/invitation`, actor)).statusCode,
            404,
          )
        }
        const direct = createDatabaseClient(env, fetch, reporter.token)
        assert.ok((await direct.rpc('list_event_reports', { p_status: 'all', p_limit: 20 })).error)
        assert.ok((await direct.rpc('get_event_report', { p_report_id: reports[0] ?? randomUUID() })).error)
        assert.ok(
          (
            await direct.rpc('resolve_event_report', {
              p_report_id: reports[0] ?? randomUUID(),
              p_action: 'cancel_event',
              p_note: 'Forged action',
            })
          ).error,
        )
        assert.equal((await request('GET', '/api/admin/event-reports?limit=51', admin)).statusCode, 400)
      },
    )
    await t.test(
      'dismissal and cancellation are audited, idempotent, bound to reports and cannot be reversed by a host',
      async () => {
        const dismissed = reports[0]
        assert.ok(dismissed)
        assert.equal(
          (
            await request('POST', `/api/admin/event-reports/${dismissed}/dismiss`, reporter, {
              note: 'Not permitted',
            })
          ).statusCode,
          403,
        )
        const dismiss = await request('POST', `/api/admin/event-reports/${dismissed}/dismiss`, admin, {
          note: 'Reviewed: insufficient evidence.',
        })
        assert.equal(dismiss.statusCode, 200)
        assert.equal(
          (
            await request('POST', `/api/admin/event-reports/${dismissed}/dismiss`, admin, {
              note: 'Repeated decision.',
            })
          ).json().changed,
          false,
        )
        assert.equal(
          (
            await request('POST', `/api/admin/event-reports/${dismissed}/take-action`, admin, {
              note: 'Conflicting decision.',
            })
          ).statusCode,
          409,
        )
        const id = await report(publicEvent),
          result = await request('POST', `/api/admin/event-reports/${id}/take-action`, admin, {
            note: 'Reviewed: event violates safety policy.',
          })
        assert.equal(result.statusCode, 200)
        assert.equal(result.json().eventId, publicEvent)
        assert.equal(
          (
            await request('POST', `/api/admin/event-reports/${id}/take-action`, admin, {
              note: 'Repeated cancellation.',
            })
          ).json().changed,
          false,
        )
        assert.equal(
          (await request('POST', `/api/events/${publicEvent}/attendees/me`, outsider)).statusCode,
          409,
        )
        assert.equal(
          (await request('PATCH', `/api/events/${publicEvent}`, host, { status: 'scheduled' })).statusCode,
          409,
        )
        const detail = (await request('GET', `/api/admin/event-reports/${id}`, admin)).json()
        assert.equal(detail.history.length, 1)
        assert.equal(detail.history[0].actorId, admin.id)
        assert.equal(detail.history[0].eventChanged, true)
        assert.equal(detail.eventStatus, 'cancelled')
        const privateReport = reports[3]
        assert.ok(privateReport)
        const invitation = (await request('GET', `/api/events/${privateEvent}/invitation`, host)).json()
        assert.equal(
          (
            await request('POST', `/api/admin/event-reports/${privateReport}/take-action`, admin, {
              note: 'Reviewed private event safety concern.',
            })
          ).statusCode,
          200,
        )
        assert.equal(
          (await request('POST', '/api/private-events/join', outsider, { code: invitation.code })).statusCode,
          400,
        )
        assert.equal(
          (
            await db.query(
              'select revoked_at is not null as revoked from private.event_invitations where event_id=$1',
              [privateEvent],
            )
          ).rows[0].revoked,
          true,
        )
        assert.equal(
          (await request('GET', `/api/events/${privateEvent}`, reporter)).json().status,
          'cancelled',
        )
        assert.equal((await request('GET', `/api/events/${privateEvent}`, admin)).statusCode, 404)
        assert.equal(
          (
            await request('POST', `/api/admin/event-reports/${id}/take-action`, admin, {
              note: 'Attempt arbitrary target',
              eventId: privateEvent,
            })
          ).statusCode,
          400,
        )
        assert.equal(
          (
            await request('POST', `/api/admin/event-reports/${randomUUID()}/dismiss`, admin, {
              note: 'Missing report fixture.',
            })
          ).statusCode,
          404,
        )
        const discovery = (await request('GET', '/api/events')).json()
        assert.ok(
          discovery.items.every((item: { id: string }) => ![publicEvent, privateEvent].includes(item.id)),
        )
      },
    )
    await t.test(
      'host deletion retains report context/audit, cancellation of missing events conflicts and failed audit rolls back',
      async () => {
        const target = await event(),
          id = await report(target)
        assert.equal((await request('DELETE', `/api/events/${target}`, host)).statusCode, 204)
        assert.equal(
          (await request('GET', `/api/admin/event-reports/${id}`, admin)).json().eventAvailable,
          false,
        )
        assert.equal(
          (
            await request('POST', `/api/admin/event-reports/${id}/take-action`, admin, {
              note: 'Cannot cancel a deleted event.',
            })
          ).statusCode,
          409,
        )
        assert.equal(
          (
            await request('POST', `/api/admin/event-reports/${id}/dismiss`, admin, {
              note: 'Event deleted by its host.',
            })
          ).statusCode,
          200,
        )
        const auditId = (await db.query('select id from private.moderation_audit where report_id=$1', [id]))
          .rows[0].id
        assert.ok(auditId)
        const live = await event(),
          liveReport = await report(live)
        assert.match(liveReport, /^[0-9a-f-]{36}$/)
        await db.query(
          `alter table private.moderation_audit add constraint moderation_fixture_failure check(report_id<>'${liveReport}'::uuid) not valid`,
        )
        try {
          assert.equal(
            (
              await request('POST', `/api/admin/event-reports/${liveReport}/take-action`, admin, {
                note: 'Failure injection fixture.',
              })
            ).statusCode,
            503,
          )
          assert.equal((await request('GET', `/api/events/${live}`, host)).json().status, 'scheduled')
          assert.equal(
            (await db.query('select status from private.event_reports where id=$1', [liveReport])).rows[0]
              .status,
            'open',
          )
        } finally {
          await db.query('alter table private.moderation_audit drop constraint moderation_fixture_failure')
        }
        await assert.rejects(db.query('update private.moderation_audit set explanation=explanation'))
        assert.equal(
          (
            await db.query('select count(*)::int as n from private.moderation_audit where report_id=$1', [
              liveReport,
            ])
          ).rows[0].n,
          0,
        )
        assert.match(live, /^[0-9a-f-]{36}$/)
        await db.query(
          `alter table public.events add constraint moderation_fixture_event_failure check(id<>'${live}'::uuid or status<>'cancelled') not valid`,
        )
        try {
          assert.equal(
            (
              await request('POST', `/api/admin/event-reports/${liveReport}/take-action`, admin, {
                note: 'Failure after the audit insert.',
              })
            ).statusCode,
            503,
          )
          assert.equal(
            (
              await db.query('select count(*)::int as n from private.moderation_audit where report_id=$1', [
                liveReport,
              ])
            ).rows[0].n,
            0,
          )
          assert.equal(
            (await db.query('select status from private.event_reports where id=$1', [liveReport])).rows[0]
              .status,
            'open',
          )
        } finally {
          await db.query('alter table public.events drop constraint moderation_fixture_event_failure')
        }
        await assert.rejects(db.query('delete from private.moderation_audit'))
      },
    )
    await t.test(
      'real parent locks serialize cancellation with attendance in both orders and preserve counters',
      async () => {
        for (const cancelFirst of [true, false]) {
          const target = await event(),
            id = await report(target)
          const locker = new pg.Client({ connectionString: url })
          await locker.connect()
          await locker.query('begin')
          const actor = cancelFirst ? admin : outsider
          await locker.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ sub: actor.id, role: 'authenticated' }),
          ])
          await locker.query('set local role authenticated')
          try {
            if (cancelFirst)
              await locker.query('select public.resolve_event_report($1,$2,$3)', [
                id,
                'cancel_event',
                'Concurrent cancellation fixture.',
              ])
            else await locker.query('select public.join_event($1)', [target])
            const pending = cancelFirst
              ? request('POST', `/api/events/${target}/attendees/me`, outsider)
              : request('POST', `/api/admin/event-reports/${id}/take-action`, admin, {
                  note: 'Concurrent cancellation fixture.',
                })
            let blocked = 0
            const deadline = Date.now() + 4000
            while (blocked === 0 && Date.now() < deadline) {
              await db.query('select pg_stat_clear_snapshot()')
              blocked = Number(
                (
                  await db.query(
                    "select count(*) n from pg_stat_activity where wait_event_type='Lock' and (query like '%join_event%' or query like '%resolve_event_report%')",
                  )
                ).rows[0].n,
              )
              if (!blocked) await new Promise((resolve) => setTimeout(resolve, 25))
            }
            assert.ok(blocked > 0, 'The second real PostgreSQL operation must wait on the parent lock.')
            await locker.query('commit')
            assert.equal((await pending).statusCode, cancelFirst ? 409 : 200)
            const row = (
              await db.query(
                'select status,participant_count,(select count(*)::int from public.event_participants where event_id=$1) as actual from public.events where id=$1',
                [target],
              )
            ).rows[0]
            assert.equal(row.status, 'cancelled')
            assert.equal(row.participant_count, row.actual)
            assert.equal(row.actual, cancelFirst ? 0 : 1)
            assert.equal((await request('POST', `/api/events/${target}/attendees/me`, host)).statusCode, 409)
          } finally {
            await locker.query('rollback')
            await locker.end()
          }
        }
      },
    )
    await t.test(
      'competing moderator decisions commit exactly one audit and one consistent resolution',
      async () => {
        const target = await event(),
          id = await report(target, host)
        const results = await Promise.all([
          request('POST', `/api/admin/event-reports/${id}/dismiss`, admin, {
            note: 'Concurrent dismissal decision.',
          }),
          request('POST', `/api/admin/event-reports/${id}/take-action`, root, {
            note: 'Concurrent cancellation decision.',
          }),
        ])
        assert.deepEqual(results.map((value) => value.statusCode).sort(), [200, 409])
        const detail = (await request('GET', `/api/admin/event-reports/${id}`, root)).json()
        assert.equal(detail.history.length, 1)
        assert.equal(detail.history[0].newStatus, detail.status)
        assert.equal(
          (await request('GET', `/api/events/${target}`, host)).json().status,
          detail.status === 'actioned' ? 'cancelled' : 'scheduled',
        )
      },
    )
    await t.test(
      'demotion revokes both HTTP and direct RPC moderation without logout; RLS grants stay narrow',
      async () => {
        const result = await request('PATCH', `/api/admin/users/${admin.id}/role`, root, { role: 'user' })
        assert.equal(result.statusCode, 200)
        assert.equal((await request('GET', '/api/admin/event-reports', admin)).statusCode, 403)
        const direct = createDatabaseClient(env, fetch, admin.token)
        assert.ok((await direct.rpc('list_event_reports', { p_status: 'all', p_limit: 20 })).error)
        assert.ok(
          (
            await direct.rpc('resolve_event_report', {
              p_report_id: reports[2] ?? randomUUID(),
              p_action: 'cancel_event',
              p_note: 'Demoted caller fixture.',
            })
          ).error,
        )
        for (const table of ['event_reports', 'event_report_attempts', 'moderation_audit']) {
          const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
            headers: {
              apikey: env.SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${root.token}`,
              'Accept-Profile': 'private',
            },
          })
          assert.ok(response.status >= 400)
          assert.equal(
            (
              await db.query(
                "select has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE') as allowed",
                [`private.${table}`],
              )
            ).rows[0].allowed,
            false,
          )
        }
        assert.equal(
          (
            await db.query(
              "select has_column_privilege('rollcall_moderation_executor','public.events','host_id','UPDATE') as allowed",
            )
          ).rows[0].allowed,
          false,
        )
        assert.equal(
          (
            await db.query(
              "select has_table_privilege('rollcall_moderation_executor','private.event_locations','SELECT') as allowed",
            )
          ).rows[0].allowed,
          false,
        )
      },
    )
  },
)
