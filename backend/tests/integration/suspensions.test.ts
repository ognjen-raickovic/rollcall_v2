import { signUpFixture } from './registration-fixture.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { buildApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createDatabaseClient } from '../../src/db/supabase.js'
import { invitationCrypto, normalizeInvitation } from '../../src/modules/events/event-invitations.js'
test(
  'local suspension enforcement, preservation, status policy, Storage and concurrency',
  {
    skip: process.env.RUN_LOCAL_INTEGRATION !== 'true',
    timeout: 180000,
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
    const app = buildApp(env, { logger: false }),
      origin = await app.listen({ host: '127.0.0.1', port: 0 })
    const ids: string[] = [],
      events: { id: string; actor: { id: string; token: string } }[] = []
    type Actor = { id: string; token: string }
    const testResponse = z.object({
      id: z.string().optional(),
      status: z.string().optional(),
      role: z.string().optional(),
      code: z.string().optional(),
      changed: z.boolean().optional(),
      imageUrl: z.string().optional(),
      items: z.array(z.object({ actorId: z.string(), newStatus: z.string() })).optional(),
    })
    const api = async (method: string, path: string, actor?: Actor, body?: unknown) => {
      const response = await fetch(`${origin}/api${path}`, {
        method,
        headers: {
          ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
          ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      })
      return { status: response.status, json: async () => testResponse.parse(await response.json()) }
    }
    t.after(async () => {
      await db.query(
        "update private.account_suspensions set status='active',reinstated_at=clock_timestamp(),reinstated_by=suspended_by,reinstatement_reason='Trusted fixture cleanup.' where profile_id=any($1::uuid[])",
        [ids],
      )
      for (const event of events) {
        await api('DELETE', `/events/${event.id}`, event.actor)
        await api('POST', `/events/${event.id}/cover/cleanup`, event.actor)
      }
      await app.close()
      await db.query('begin')
      try {
        await db.query("set local session_replication_role='replica'")
        await db.query('delete from private.suspension_audit where target_id=any($1::uuid[])', [ids])
        await db.query('delete from private.role_audit where target_id=any($1::uuid[])', [ids])
        await db.query('delete from private.event_reports where reporter_id=any($1::uuid[])', [ids])
        await db.query('commit')
      } catch (error) {
        await db.query('rollback')
        throw error
      }
      await db.query(
        "delete from private.event_cover_objects where event_id=any($1::uuid[]) and state='deleted'",
        [events.map((e) => e.id)],
      )
      await db.query('delete from auth.users where id=any($1::uuid[])', [ids])
      await db.end()
    })
    async function account(role?: 'admin' | 'superadmin') {
      const auth = createDatabaseClient(env).auth,
        signup = await signUpFixture(auth, db, {
          email: `suspension-${randomUUID()}@example.test`,
          password: `Rc!${randomUUID()}aA7`,
        }),
        id = signup.data.user?.id
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
    const user = await account(),
      other = await account(),
      admin = await account('admin'),
      secondAdmin = await account('admin'),
      root = await account('superadmin'),
      secondRoot = await account('superadmin')
    const game = (await db.query('select id from public.games order by id limit 1')).rows[0].id,
      city = (await db.query('select id from public.cities order by id limit 1')).rows[0].id
    const input = (visibility = 'public') => ({
      title: 'Account status fixture',
      description: 'Synthetic event for local suspension verification.',
      gameId: game,
      cityId: city,
      address: 'Protected suspension fixture address',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      endsAt: new Date(Date.now() + 90000000).toISOString(),
      capacity: 3,
      experienceLevel: 'all-levels',
      visibility,
    })
    async function event(actor = other, visibility = 'public') {
      const result = await api('POST', '/events', actor, input(visibility))
      assert.equal(result.status, 201)
      const id = z.uuid().parse((await result.json()).id)
      events.push({ id, actor })
      return id
    }
    async function status(actor = user) {
      const response = await api('GET', '/me/account-status', actor)
      assert.equal(response.status, 200)
      return response.json()
    }
    async function change(actor: Actor, target: Actor, suspend: boolean) {
      return api(suspend ? 'POST' : 'DELETE', `/admin/users/${target.id}/suspension`, actor, {
        reason: suspend
          ? 'Verified temporary suspension fixture.'
          : 'Verified temporary reinstatement fixture.',
      })
    }
    const own = await event(user),
      privateOwn = await event(user, 'private'),
      joinable = await event(),
      privateOther = await event(other, 'private')
    assert.equal((await api('POST', `/events/${joinable}/attendees/me`, user)).status, 200)
    const code = (
      (await (
        await fetch(`${origin}/api/events/${privateOther}/invitation`, {
          headers: { Authorization: `Bearer ${other.token}` },
        })
      ).json()) as { code: string }
    ).code
    assert.equal((await api('POST', '/private-events/join', user, { code })).status, 200)
    const report = (await (await api('POST', `/events/${own}/reports`, other, { reason: 'other' })).json()).id
    const bytes = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#654599' } })
      .webp()
      .toBuffer()
    const form = () => {
      const data = new FormData()
      data.set('file', new File([new Uint8Array(bytes)], 'fixture.webp', { type: 'image/webp' }))
      return data
    }
    assert.equal((await api('POST', `/events/${privateOwn}/cover`, user, form())).status, 200)
    const priorCover = await (await api('GET', `/events/${privateOwn}/cover-url`, user)).json(),
      signedUrl = z.url().parse(priorCover.imageUrl)
    const operationClient = (actor: Actor) =>
      createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: {
            Authorization: `Bearer ${actor.token}`,
            'x-rollcall-cover-key': env.EVENT_COVER_OPERATION_KEY ?? '',
          },
        },
      })
    assert.equal(
      (await api('PUT', `/me/game-experience/${game}`, user, { experience: 'beginner' })).status,
      200,
    )
    const reserved = await operationClient(user).rpc('reserve_event_cover', { p_event_id: privateOwn })
    assert.equal(reserved.error, null)
    const reservedPath = reserved.data.path as string
    await t.test('current role policy, status privacy, duplicates and atomic suspension audits', async () => {
      assert.deepEqual(await status(), { status: 'active' })
      assert.equal((await api('GET', '/me/account-status')).status, 401)
      for (const [actor, target] of [
        [user, other],
        [admin, secondAdmin],
        [admin, root],
        [root, root],
        [root, secondRoot],
      ] as const)
        assert.equal((await change(actor, target, true)).status, 403)
      assert.equal(
        (
          await api('POST', `/admin/users/${randomUUID()}/suspension`, root, {
            reason: 'Missing fixture account.',
          })
        ).status,
        404,
      )
      assert.equal(
        (await api('POST', `/admin/users/${user.id}/suspension`, admin, { reason: 'Bad' })).status,
        400,
      )
      assert.equal((await change(admin, user, true)).status, 200)
      assert.equal((await (await change(admin, user, true)).json()).changed, false)
      assert.deepEqual(await status(), { status: 'suspended' })
      const audit = await (await api('GET', `/admin/suspension-audit?targetId=${user.id}`, admin)).json()
      assert.ok(audit.items)
      assert.equal(audit.items.length, 1)
      assert.equal(audit.items[0]?.actorId, admin.id)
      assert.equal(audit.items[0]?.newStatus, 'suspended')
      assert.equal((await api('GET', '/me', user)).status, 200)
      assert.equal((await api('GET', '/admin/suspension-audit', admin)).status, 403)
    })
    await t.test(
      'existing JWT is denied across all authenticated HTTP and direct Data API paths',
      async () => {
        const paths: [string, string, unknown?][] = [
          ['POST', '/events', input()],
          ['PATCH', `/events/${own}`, { title: 'Blocked edit' }],
          ['DELETE', `/events/${own}`],
          ['POST', `/events/${joinable}/attendees/me`],
          ['DELETE', `/events/${joinable}/attendees/me`],
          ['POST', `/events/${joinable}/reports`, { reason: 'other' }],
          ['PATCH', '/me/profile', { displayName: 'Blocked profile' }],
          ['PUT', `/me/game-experience/${game}`, { experience: 'beginner' }],
          ['DELETE', `/me/game-experience/${game}`],
          ['GET', `/events/${privateOwn}/invitation`],
          ['POST', `/events/${privateOwn}/invitation/rotate`],
          ['POST', '/private-events/join', { code }],
          ['POST', `/events/${privateOwn}/cover`, form()],
          ['DELETE', `/events/${privateOwn}/cover`],
          ['GET', `/events/${privateOwn}/cover-url`],
          ['GET', `/events/${privateOther}`],
          ['GET', '/me/permissions'],
          ['GET', '/admin/event-reports'],
        ]
        for (const [method, path, body] of paths) {
          const response = await api(method, path, user, body)
          assert.equal(response.status, 403, `${method} ${path.split('?')[0]}`)
          assert.equal((await response.json()).code, 'ACCOUNT_SUSPENDED')
        }
        const calls: [string, Record<string, unknown>][] = [
          ['get_my_profile', {}],
          ['update_my_profile', { p_patch: { displayName: 'Blocked' } }],
          ['set_my_game_experience', { p_game_id: game, p_experience: 'beginner' }],
          ['remove_my_game_experience', { p_game_id: game }],
          ['create_event', { p_input: input() }],
          ['update_event', { p_event_id: own, p_patch: { title: 'Blocked' } }],
          ['delete_event', { p_event_id: own }],
          ['get_event', { p_event_id: privateOther }],
          ['join_event', { p_event_id: joinable }],
          ['leave_event', { p_event_id: joinable }],
          ['submit_event_report', { p_event_id: joinable, p_reason: 'other' }],
          [
            'manage_event_invitation',
            {
              p_event_id: privateOwn,
              p_hash: '0'.repeat(64),
              p_sealed: 'unused',
              p_expires: new Date(Date.now() + 3600000).toISOString(),
              p_action: 'ensure',
            },
          ],
          ['redeem_event_invitation', { p_hash: '0'.repeat(64) }],
          ['reserve_event_cover', { p_event_id: privateOwn }],
          ['commit_event_cover', { p_event_id: privateOwn, p_path: reservedPath }],
          ['remove_event_cover', { p_event_id: privateOwn }],
          ['abort_event_cover', { p_event_id: privateOwn, p_path: reservedPath }],
          ['pending_event_cover_cleanup', { p_event_id: privateOwn }],
          ['complete_event_cover_cleanup', { p_path: reservedPath }],
          ['get_event_cover', { p_event_id: privateOwn }],
          ['my_permissions', {}],
          ['admin_users', {}],
          ['change_admin_role', { p_target: other.id, p_role: 'admin' }],
          ['list_event_reports', {}],
          ['resolve_event_report', { p_report_id: report, p_action: 'dismiss', p_note: 'Blocked decision.' }],
        ]
        for (const [name, body] of calls) {
          const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
            method: 'POST',
            headers: {
              apikey: env.SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${user.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          })
          assert.equal(response.status, 403, name)
          assert.equal(
            z.object({ message: z.string() }).parse(await response.json()).message,
            'ACCOUNT_SUSPENDED',
            name,
          )
        }
        const raw = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
          method: 'PATCH',
          headers: {
            apikey: env.SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${user.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ display_name: 'Blocked direct write' }),
        })
        assert.equal(raw.status, 403)
        for (const method of ['PATCH', 'DELETE']) {
          const response = await fetch(
            `${env.SUPABASE_URL}/rest/v1/user_game_experience?profile_id=eq.${user.id}`,
            {
              method,
              headers: {
                apikey: env.SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${user.token}`,
                'Content-Type': 'application/json',
              },
              ...(method === 'PATCH' ? { body: JSON.stringify({ experience_level: 'veteran' }) } : {}),
            },
          )
          assert.equal(response.status, 403)
        }
        assert.ok(
          (
            await operationClient(user)
              .storage.from('event-covers')
              .upload(reservedPath, bytes, { contentType: 'image/webp' })
          ).error,
        )
        assert.ok(
          (await operationClient(user).storage.from('event-covers').createSignedUrl(reservedPath, 60)).error,
        )
        assert.equal(
          (
            await db.query('select count(*)::int n from storage.objects where bucket_id=$1 and name=$2', [
              'event-covers',
              reservedPath,
            ])
          ).rows[0].n,
          0,
        )
        assert.equal((await fetch(signedUrl)).status, 200) // Bounded pre-issued URL limitation.
        assert.equal((await api('GET', '/events')).status, 200)
        assert.equal(
          (
            await db.query('select count(*)::int n from public.event_participants where profile_id=$1', [
              user.id,
            ])
          ).rows[0].n,
          2,
        )
        assert.equal(
          (await db.query('select count(*)::int n from private.event_reports where id=$1', [report])).rows[0]
            .n,
          1,
        )
      },
    )
    await t.test(
      'reinstatement restores existing session without changing roles or data; suspended privileged actors fail closed',
      async () => {
        assert.equal((await change(admin, user, false)).status, 200)
        assert.equal((await (await change(admin, user, false)).json()).changed, false)
        assert.deepEqual(await status(), { status: 'active' })
        assert.equal(
          (await api('PATCH', '/me/profile', user, { displayName: 'Reinstated player' })).status,
          200,
        )
        assert.equal((await api('GET', `/events/${privateOther}`, user)).status, 200)
        assert.equal((await api('GET', `/events/${privateOwn}/cover-url`, user)).status, 200)
        assert.equal((await api('GET', '/me/permissions', user)).status, 200)
        assert.equal((await (await api('GET', '/me/permissions', user)).json()).role, 'user')
        assert.equal((await change(root, secondAdmin, true)).status, 200)
        assert.equal((await api('GET', '/admin/event-reports', secondAdmin)).status, 403)
        assert.ok(
          (
            await createDatabaseClient(env, fetch, secondAdmin.token).rpc('list_event_reports', {
              p_status: 'all',
              p_limit: 20,
            })
          ).error,
        )
        assert.equal((await change(admin, secondAdmin, false)).status, 403)
        assert.equal((await change(root, secondAdmin, false)).status, 200)
        assert.equal((await (await api('GET', '/me/permissions', secondAdmin)).json()).role, 'admin')
        await db.query(
          "insert into private.account_suspensions(profile_id,status,suspended_at,suspended_by,suspension_reason) values($1,'suspended',clock_timestamp(),$2,'Operational state fixture only.')",
          [secondRoot.id, root.id],
        )
        assert.deepEqual(await status(secondRoot), { status: 'suspended' })
        assert.equal((await api('GET', '/admin/users', secondRoot)).status, 403)
        assert.ok(
          (
            await createDatabaseClient(env, fetch, secondRoot.token).rpc('change_admin_role', {
              p_target: other.id,
              p_role: 'admin',
            })
          ).error,
        )
      },
    )
    async function waitForLock(query: string) {
      let count = 0
      const deadline = Date.now() + 4000
      while (!count && Date.now() < deadline) {
        await db.query('select pg_stat_clear_snapshot()')
        count = Number(
          (
            await db.query(
              "select count(*) n from pg_stat_activity where wait_event_type='Lock' and query like $1",
              [`%${query}%`],
            )
          ).rows[0].n,
        )
        if (!count) await new Promise((r) => setTimeout(r, 25))
      }
      assert.ok(count > 0, 'A real PostgreSQL operation must wait on the account/role lock.')
    }
    await t.test(
      'suspension versus join, creation and private redemption is serialized in both commit orders',
      async () => {
        for (const operation of ['join', 'create', 'redeem'] as const)
          for (const suspendFirst of [false, true]) {
            const actor = await account(),
              target = await event(other, operation === 'redeem' ? 'private' : 'public')
            const invite =
              operation === 'redeem'
                ? (
                    (await (
                      await fetch(`${origin}/api/events/${target}/invitation`, {
                        headers: { Authorization: `Bearer ${other.token}` },
                      })
                    ).json()) as { code: string }
                  ).code
                : null
            const hash = invite
              ? invitationCrypto(env.EVENT_INVITATION_KEY ?? '').hash(normalizeInvitation(invite))
              : null
            const locker = new pg.Client({ connectionString: url })
            await locker.connect()
            await locker.query('begin')
            await locker.query("select set_config('request.jwt.claims',$1,true)", [
              JSON.stringify({ sub: (suspendFirst ? root : actor).id, role: 'authenticated' }),
            ])
            await locker.query("select set_config('request.headers',$1,true)", [
              JSON.stringify({ 'x-rollcall-cover-key': env.EVENT_COVER_OPERATION_KEY }),
            ])
            await locker.query('set local role authenticated')
            try {
              if (suspendFirst)
                await locker.query('select public.change_account_suspension($1,true,$2)', [
                  actor.id,
                  'Concurrent suspension boundary.',
                ])
              else if (operation === 'join') await locker.query('select public.join_event($1)', [target])
              else if (operation === 'create') {
                const created = (
                  await locker.query('select public.create_event($1::jsonb) value', [JSON.stringify(input())])
                ).rows[0].value
                events.push({ id: created.id, actor })
              } else await locker.query('select public.redeem_event_invitation($1)', [hash])
              const pending = suspendFirst
                ? operation === 'join'
                  ? api('POST', `/events/${target}/attendees/me`, actor)
                  : operation === 'create'
                    ? api('POST', '/events', actor, input())
                    : api('POST', '/private-events/join', actor, { code: invite })
                : change(root, actor, true)
              await waitForLock(
                suspendFirst
                  ? operation === 'join'
                    ? 'join_event'
                    : operation === 'create'
                      ? 'create_event'
                      : 'redeem_event_invitation'
                  : 'change_account_suspension',
              )
              await locker.query('commit')
              const result = await pending
              assert.equal(result.status, suspendFirst ? 403 : 200)
              if (suspendFirst) assert.equal((await result.json()).code, 'ACCOUNT_SUSPENDED')
              assert.deepEqual(await status(actor), { status: 'suspended' })
              const counters = (
                await db.query(
                  'select participant_count,(select count(*)::int from public.event_participants where event_id=$1) actual from public.events where id=$1',
                  [target],
                )
              ).rows[0]
              assert.equal(counters.participant_count, counters.actual)
            } finally {
              await locker.query('rollback')
              await locker.end()
            }
          }
      },
    )
    await t.test(
      'Storage upload reserved before suspension waits on the same account boundary and cannot write after it',
      async () => {
        const actor = await account(),
          target = await event(actor, 'private')
        const reservation = await operationClient(actor).rpc('reserve_event_cover', { p_event_id: target })
        assert.equal(reservation.error, null)
        const path = z.string().parse(reservation.data.path),
          locker = new pg.Client({ connectionString: url })
        await locker.connect()
        await locker.query('begin')
        await locker.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ sub: root.id, role: 'authenticated' }),
        ])
        await locker.query('set local role authenticated')
        try {
          await locker.query('select public.change_account_suspension($1,true,$2)', [
            actor.id,
            'Concurrent Storage boundary fixture.',
          ])
          const pending = operationClient(actor)
            .storage.from('event-covers')
            .upload(path, bytes, { contentType: 'image/webp' })
          // Start the SDK operation before observing the database wait.
          const completed = Promise.resolve(pending)
          await waitForLock('objects')
          await locker.query('commit')
          assert.ok((await completed).error)
          assert.equal(
            (
              await db.query('select count(*)::int n from storage.objects where bucket_id=$1 and name=$2', [
                'event-covers',
                path,
              ])
            ).rows[0].n,
            0,
          )
        } finally {
          await locker.query('rollback')
          await locker.end()
        }
      },
    )
    await t.test(
      'role changes serialize target eligibility; conflicting state updates preserve audit chain and failures roll back',
      async () => {
        const target = await account(),
          locker = new pg.Client({ connectionString: url })
        await locker.connect()
        await locker.query('begin')
        await locker.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ sub: root.id, role: 'authenticated' }),
        ])
        await locker.query('set local role authenticated')
        try {
          await locker.query('select public.change_admin_role($1,$2)', [target.id, 'admin'])
          const pending = change(admin, target, true)
          await waitForLock('change_account_suspension')
          await locker.query('commit')
          assert.equal((await pending).status, 403)
        } finally {
          await locker.query('rollback')
          await locker.end()
        }
        assert.deepEqual(await status(target), { status: 'active' })
        const ordinary = await account()
        const results = await Promise.all(
          Array.from({ length: 6 }, (_, i) => change(root, ordinary, i % 2 === 0)),
        )
        assert.ok(results.every((r) => r.status === 200))
        let previous = 'active'
        for (const row of (
          await db.query(
            'select previous_status,new_status from private.suspension_audit where target_id=$1 order by id',
            [ordinary.id],
          )
        ).rows) {
          assert.equal(row.previous_status, previous)
          assert.notEqual(row.previous_status, row.new_status)
          previous = row.new_status
        }
        assert.equal((await status(ordinary)).status, previous)
        const failed = await account()
        assert.match(failed.id, /^[0-9a-f-]{36}$/)
        await db.query(
          `alter table private.suspension_audit add constraint suspension_fixture_failure check(target_id<>'${failed.id}'::uuid) not valid`,
        )
        try {
          assert.equal((await change(root, failed, true)).status, 503)
          assert.deepEqual(await status(failed), { status: 'active' })
        } finally {
          await db.query('alter table private.suspension_audit drop constraint suspension_fixture_failure')
        }
        await assert.rejects(db.query('update private.suspension_audit set reason=reason'))
        await assert.rejects(db.query('delete from private.suspension_audit'))
      },
    )
  },
)
