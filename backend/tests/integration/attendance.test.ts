import { signUpFixture } from './registration-fixture.js'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'
import { test } from 'node:test'
import pg from 'pg'
import { buildApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createDatabaseClient } from '../../src/db/supabase.js'
import { validateLocalDatabaseUrl } from '../../scripts/geography/store.js'
import type { AttendanceResult, EventDetails, HostEventDetails } from '../../src/modules/events/types.js'

type Actor = { id: string; token: string }
type Operation = 'join_event' | 'leave_event'
type Outcome = { value: AttendanceResult; error?: never } | { error: string; value?: never }

function assertNoPrivateFields(value: unknown, allowAddress = false): void {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    assert.ok(
      ![
        'email',
        'birthYear',
        'ageDeclaredAt',
        'role',
        'accessToken',
        'roomCode',
        'participantIds',
        'attendeeIds',
      ].includes(key),
      `Unexpected field: ${key}`,
    )
    if (!allowAddress) assert.notEqual(key, 'address')
    assertNoPrivateFields(child, allowAddress)
  }
}

test(
  'local HTTP attendance and genuinely concurrent PostgreSQL participation',
  {
    skip:
      process.env.RUN_LOCAL_INTEGRATION === 'true'
        ? false
        : 'Requires local Supabase and RUN_LOCAL_INTEGRATION=true.',
    timeout: 120000,
  },
  async (t) => {
    const env = loadEnvironment()
    assert.ok(
      ['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.SUPABASE_URL).hostname),
      'Only local Supabase is permitted.',
    )
    const connectionString = validateLocalDatabaseUrl(process.env.GEOGRAPHY_DATABASE_URL)
    const db = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 })
    await db.connect()
    const app = buildApp(env, { logger: false })
    const emails: string[] = []
    const actors: Actor[] = []
    const clients = new Set<pg.Client>()
    t.after(async () => {
      await Promise.allSettled([...clients].map((client) => client.end()))
      await app.close()
      try {
        await db.query('delete from public.events where host_id=any($1::uuid[])', [
          actors.map((actor) => actor.id),
        ])
        await db.query('delete from auth.users where email=any($1::text[])', [emails])
      } finally {
        await db.end()
      }
    })
    const origin = await app.listen({ host: '127.0.0.1', port: 0 })
    async function api(method: string, path: string, actor?: Actor, body?: unknown) {
      const options: RequestInit = {
        method,
        headers: {
          ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        signal: AbortSignal.timeout(15000),
      }
      if (body !== undefined) options.body = JSON.stringify(body)
      return fetch(new URL(path, origin), options)
    }
    async function json<T>(response: Response, status = 200): Promise<T> {
      assert.equal(response.status, status, 'Unexpected HTTP status; credentials are not logged.')
      return (await response.json()) as T
    }
    async function account(): Promise<Actor> {
      const email = `attendance-integration-${randomUUID()}@example.test`
      emails.push(email)
      const auth = createDatabaseClient(env).auth
      const signup = await signUpFixture(auth, db, { email, password: `Rc!${randomUUID()}aA7` })
      assert.equal(Boolean(signup.error), false, 'Local registration must work.')
      const id = signup.data.user?.id
      assert.ok(id)
      assert.equal(signup.data.session, null, 'Email confirmation stays enabled.')
      const hash = (
        await db.query<{ confirmation_token: string }>(
          'select confirmation_token from auth.users where id=$1',
          [id],
        )
      ).rows[0]?.confirmation_token
      assert.ok(hash)
      const confirmed = await auth.verifyOtp({ token_hash: hash, type: 'signup' })
      assert.equal(Boolean(confirmed.error), false)
      const token = confirmed.data.session?.access_token
      assert.ok(token)
      const actor = { id, token }
      actors.push(actor)
      return actor
    }
    const host = await account(),
      one = await account(),
      two = await account(),
      three = await account()
    const game = (await json<{ id: number }[]>(await api('GET', '/api/games')))[0]
    const city = (await json<{ id: number }[]>(await api('GET', '/api/cities?country=ME&q=Podgorica')))[0]
    assert.ok(game && city)
    const gameId = game.id,
      cityId = city.id
    async function create(overrides: Record<string, unknown> = {}): Promise<HostEventDetails> {
      return json<HostEventDetails>(
        await api('POST', '/api/events', host, {
          title: `Attendance ${randomUUID().slice(0, 8)}`,
          description: 'A synthetic local attendance integration table.',
          gameId,
          cityId,
          address: 'Synthetic protected attendance address',
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 93600000).toISOString(),
          capacity: 2,
          experienceLevel: 'experienced',
          tags: ['Veterans only'],
          minimumAge: 18,
          ...overrides,
        }),
        201,
      )
    }
    function attendancePath(id: string) {
      return `/api/events/${id}/attendees/me`
    }
    async function detail(id: string, actor?: Actor) {
      return json<EventDetails>(await api('GET', `/api/events/${id}`, actor))
    }
    async function state(id: string) {
      const result = (
        await db.query<{ participant_count: number; capacity: number; actual: number; updated: string }>(
          'select e.participant_count,e.capacity,e.updated_at::text updated,(select count(*)::int from public.event_participants p where p.event_id=e.id) actual from public.events e where e.id=$1',
          [id],
        )
      ).rows[0]
      assert.ok(result)
      assert.equal(result.participant_count, result.actual)
      assert.ok(result.actual >= 0 && result.actual <= result.capacity)
      return result
    }
    async function transaction(actor: Actor, label: string) {
      const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 })
      clients.add(client)
      await client.connect()
      await client.query('begin')
      await client.query(
        "select set_config('application_name',$1,true),set_config('statement_timeout','12000',true),set_config('request.jwt.claims',$2,true)",
        [label, JSON.stringify({ sub: actor.id, role: 'authenticated' })],
      )
      await client.query('set local role authenticated')
      return client
    }
    async function operation(client: pg.Client, name: Operation, id: string): Promise<Outcome> {
      try {
        // The function name is a closed internal union, never request input; IDs are bound.
        const query =
          name === 'join_event'
            ? 'select public.join_event($1::uuid) value'
            : 'select public.leave_event($1::uuid) value'
        return {
          value: (await client.query<{ value: AttendanceResult }>(query, [id])).rows[0]
            ?.value as AttendanceResult,
        }
      } catch (error) {
        return { error: error instanceof pg.DatabaseError ? (error.code ?? 'UNKNOWN') : 'UNKNOWN' }
      }
    }
    async function close(client: pg.Client) {
      await client.query('rollback').catch(() => {})
      await client.end()
      clients.delete(client)
    }
    async function waitForLock(label: string) {
      const deadline = Date.now() + 4000
      while (Date.now() < deadline) {
        const row = (
          await db.query<{ blocked: boolean }>(
            "select exists(select 1 from pg_stat_activity where application_name=$1 and wait_event_type='Lock') blocked",
            [label],
          )
        ).rows[0]
        if (row?.blocked) return
        await pause(25)
      }
      assert.fail('The second PostgreSQL transaction must demonstrably wait for a row lock.')
    }
    async function heldRace(
      id: string,
      firstActor: Actor,
      firstName: Operation,
      secondActor: Actor,
      secondName: Operation,
    ) {
      const label = `attendance-race-${randomUUID()}`
      const first = await transaction(firstActor, `${label}-first`)
      const second = await transaction(secondActor, `${label}-second`)
      let pending: Promise<Outcome> | undefined
      try {
        const reserved = await operation(first, firstName, id)
        assert.ok(reserved.value, 'The first transactional RPC must succeed.')
        pending = operation(second, secondName, id)
        await waitForLock(`${label}-second`)
        await first.query('commit')
        const followed = await pending
        if (followed.value) await second.query('commit')
        else await second.query('rollback')
        return { reserved: reserved.value, followed }
      } finally {
        await first.query('rollback').catch(() => {})
        if (pending) await pending
        await Promise.all([close(first), close(second)])
      }
    }

    await t.test(
      'HTTP joining and leaving persist, are idempotent and expose only viewer-authorized addresses',
      async () => {
        const event = await create()
        assertNoPrivateFields(await detail(event.id))
        assert.deepEqual((await detail(event.id, one)).viewer, {
          userId: one.id,
          isHost: false,
          hasJoined: false,
        })
        const response = await api('POST', attendancePath(event.id), one)
        assert.equal(response.headers.get('cache-control'), 'no-store')
        assert.equal(response.headers.get('vary'), 'Authorization')
        const joined = await json<AttendanceResult>(response)
        assert.deepEqual(joined, {
          eventId: event.id,
          hasJoined: true,
          capacity: 2,
          participantCount: 1,
          availableSlots: 1,
        })
        assertNoPrivateFields(joined)
        const participant = await detail(event.id, one)
        assert.equal('address' in participant ? participant.address : undefined, event.address)
        assert.deepEqual(participant.viewer, { userId: one.id, isHost: false, hasJoined: true })
        assertNoPrivateFields(participant, true)
        const beforeRepeat = await state(event.id)
        assert.deepEqual(
          await json<AttendanceResult>(await api('POST', attendancePath(event.id), one)),
          joined,
        )
        assert.deepEqual(
          await state(event.id),
          beforeRepeat,
          'Repeated join cannot update timestamps or consume a seat.',
        )
        assert.equal((await detail(event.id, host)).viewer.isHost, true)
        assertNoPrivateFields(await detail(event.id, two))
        const freshApp = buildApp(env, { logger: false })
        try {
          const persisted = await freshApp.inject({
            url: `/api/events/${event.id}`,
            headers: { authorization: `Bearer ${one.token}` },
          })
          assert.equal(persisted.statusCode, 200)
          assert.equal(persisted.json<EventDetails>().viewer.hasJoined, true)
        } finally {
          await freshApp.close()
        }
        const left = await json<AttendanceResult>(await api('DELETE', attendancePath(event.id), one))
        assert.deepEqual(left, {
          eventId: event.id,
          hasJoined: false,
          capacity: 2,
          participantCount: 0,
          availableSlots: 2,
        })
        const afterLeave = await state(event.id)
        assert.deepEqual(
          await json<AttendanceResult>(await api('DELETE', attendancePath(event.id), one)),
          left,
        )
        assert.deepEqual(await state(event.id), afterLeave)
        assertNoPrivateFields(await detail(event.id, one))
      },
    )

    await t.test('auth, ownership, timing, capacity and strict payloads cannot be bypassed', async () => {
      const event = await create({ capacity: 1 })
      for (const method of ['POST', 'DELETE']) {
        assert.equal((await api(method, attendancePath(event.id))).status, 401)
        assert.equal((await api(method, attendancePath('invalid'), one)).status, 400)
        assert.equal((await api(method, attendancePath(randomUUID()), one)).status, 404)
        assert.equal((await api(method, attendancePath(event.id), host)).status, 409)
        assert.equal((await api(method, attendancePath(event.id), one, { userId: two.id })).status, 400)
        assert.equal((await api(method, `${attendancePath(event.id)}?userId=${two.id}`, one)).status, 400)
        assert.equal((await api(method, `/api/events/${event.id}/attendees/${two.id}`, one)).status, 404)
      }
      await json<AttendanceResult>(await api('POST', attendancePath(event.id), one, {}))
      assert.equal((await api('POST', attendancePath(event.id), two)).status, 409)
      const before = await state(event.id)
      await json<AttendanceResult>(await api('POST', attendancePath(event.id), one))
      await json<AttendanceResult>(await api('DELETE', attendancePath(event.id), two))
      assert.deepEqual(await state(event.id), before, 'Another user cannot remove the existing membership.')
      await json<HostEventDetails>(
        await api('PATCH', `/api/events/${event.id}`, host, { status: 'cancelled' }),
      )
      for (const method of ['POST', 'DELETE'])
        for (const actor of [one, two])
          assert.equal((await api(method, attendancePath(event.id), actor)).status, 409)
      assert.equal((await state(event.id)).actual, 1)
      const past = await create({ startsAt: new Date(Date.now() + 3000).toISOString() })
      await json<AttendanceResult>(await api('POST', attendancePath(past.id), one))
      await pause(Math.max(0, Date.parse(past.startsAt) - Date.now() + 80))
      for (const method of ['POST', 'DELETE'])
        assert.equal((await api(method, attendancePath(past.id), one)).status, 409)
      assert.equal((await state(past.id)).actual, 1)
      assert.equal((await api('DELETE', `/api/events/${past.id}`, host)).status, 204)
    })

    await t.test(
      'unlisted membership and existing private participation preserve concealment and revoke address access on leave',
      async () => {
        const event = await create({ visibility: 'unlisted' })
        await json<AttendanceResult>(await api('POST', attendancePath(event.id), one))
        await json<HostEventDetails>(
          await api('PATCH', `/api/events/${event.id}`, host, { visibility: 'private' }),
        )
        assert.equal((await detail(event.id, one)).viewer.hasJoined, true)
        const missing = await api('GET', `/api/events/${randomUUID()}`, two)
        const missingBody = await missing.text()
        for (const actor of [undefined, two]) {
          const hidden = await api('GET', `/api/events/${event.id}`, actor)
          assert.equal(hidden.status, 404)
          assert.equal(await hidden.text(), missingBody)
        }
        for (const method of ['POST', 'DELETE'])
          assert.equal((await api(method, attendancePath(event.id), two)).status, 404)
        await json<AttendanceResult>(await api('POST', attendancePath(event.id), one))
        const left = await json<AttendanceResult>(await api('DELETE', attendancePath(event.id), one))
        assert.equal(left.hasJoined, false)
        assert.equal(left.participantCount, 0)
        assertNoPrivateFields(left)
        assert.equal((await api('GET', `/api/events/${event.id}`, one)).status, 404)
        assert.equal((await api('POST', attendancePath(event.id), one)).status, 404)
        assert.equal((await api('DELETE', attendancePath(event.id), one)).status, 404)
        assert.equal((await detail(event.id, host)).viewer.isHost, true)
        const listed = await json<{ items: { id: string }[] }>(await api('GET', '/api/events'))
        assert.ok(listed.items.every((item) => item.id !== event.id))
        await db.query("insert into private.account_roles(profile_id,role) values($1,'superadmin')", [two.id])
        assert.equal((await api('GET', `/api/events/${event.id}`, two)).status, 404)
        assert.equal((await api('POST', attendancePath(event.id), two)).status, 404)
      },
    )

    await t.test(
      'RPC races prove final-seat serialization, duplicate safety, join/leave consistency and capacity edits',
      async () => {
        const finalSeat = await create({ capacity: 1 })
        const final = await heldRace(finalSeat.id, one, 'join_event', two, 'join_event')
        assert.equal(final.followed.error, 'RA003')
        assert.equal((await state(finalSeat.id)).actual, 1)
        const duplicate = await create({ capacity: 1 })
        const repeated = await heldRace(duplicate.id, one, 'join_event', one, 'join_event')
        assert.ok(repeated.followed.value)
        assert.deepEqual(repeated.reserved, repeated.followed.value)
        assert.equal((await state(duplicate.id)).actual, 1)
        const mixed = await create({ capacity: 1 })
        await json<AttendanceResult>(await api('POST', attendancePath(mixed.id), one))
        const freed = await heldRace(mixed.id, one, 'leave_event', two, 'join_event')
        assert.equal(freed.followed.value?.hasJoined, true)
        assert.equal((await state(mixed.id)).actual, 1)
        assert.equal((await detail(mixed.id, one)).viewer.hasJoined, false)
        assert.equal((await detail(mixed.id, two)).viewer.hasJoined, true)

        const privateEvent = await create({ visibility: 'unlisted' })
        await json<AttendanceResult>(await api('POST', attendancePath(privateEvent.id), one))
        await json<HostEventDetails>(
          await api('PATCH', `/api/events/${privateEvent.id}`, host, { visibility: 'private' }),
        )
        const privateLeaves = await heldRace(privateEvent.id, one, 'leave_event', one, 'leave_event')
        assert.equal(
          privateLeaves.followed.error,
          'P0002',
          'A blocked private leave must recheck current membership before returning any event state.',
        )
        assert.equal((await state(privateEvent.id)).actual, 0)
        assert.equal((await api('GET', `/api/events/${privateEvent.id}`, one)).status, 404)

        const capacity = await create({ capacity: 2 })
        await json<AttendanceResult>(await api('POST', attendancePath(capacity.id), one))
        const label = `attendance-capacity-${randomUUID()}`
        const joining = await transaction(two, `${label}-join`)
        const editing = await transaction(host, `${label}-edit`)
        let pending: Promise<string | undefined> | undefined
        try {
          assert.ok((await operation(joining, 'join_event', capacity.id)).value)
          pending = editing
            .query('select public.update_event($1::uuid,$2::jsonb)', [
              capacity.id,
              JSON.stringify({ capacity: 1 }),
            ])
            .then(
              () => undefined,
              (error: unknown) => (error instanceof pg.DatabaseError ? error.code : 'UNKNOWN'),
            )
          await waitForLock(`${label}-edit`)
          await joining.query('commit')
          assert.equal(await pending, 'PT409')
          await editing.query('rollback')
          assert.equal((await state(capacity.id)).actual, 2)
        } finally {
          await joining.query('rollback').catch(() => {})
          if (pending) await pending
          await Promise.all([close(joining), close(editing)])
        }
      },
    )

    await t.test(
      'multiple simultaneous HTTP joins stay bounded and duplicate requests consume one seat',
      async () => {
        const event = await create({ capacity: 2 })
        const responses = await Promise.all(
          [one, two, three].map((actor) => api('POST', attendancePath(event.id), actor)),
        )
        assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200, 409])
        assert.equal((await state(event.id)).actual, 2)
        const duplicate = await create({ capacity: 1 })
        const same = await Promise.all(
          Array.from({ length: 4 }, () => api('POST', attendancePath(duplicate.id), one)),
        )
        assert.ok(same.every((response) => response.status === 200))
        assert.equal((await state(duplicate.id)).actual, 1)
        const leaves = await Promise.all(
          Array.from({ length: 4 }, () => api('DELETE', attendancePath(duplicate.id), one)),
        )
        assert.ok(leaves.every((response) => response.status === 200))
        assert.equal((await state(duplicate.id)).actual, 0)
      },
    )

    await t.test(
      'a join blocked past the start is rejected after locking, and Data API clients cannot bypass policies',
      async () => {
        const event = await create({ startsAt: new Date(Date.now() + 3000).toISOString() })
        const label = `attendance-start-${randomUUID()}`
        const holder = await transaction(host, `${label}-hold`)
        const joining = await transaction(one, `${label}-join`)
        let pending: Promise<Outcome> | undefined
        try {
          await holder.query('select public.update_event($1::uuid,$2::jsonb)', [
            event.id,
            JSON.stringify({ title: 'Start boundary fixture' }),
          ])
          pending = operation(joining, 'join_event', event.id)
          await waitForLock(`${label}-join`)
          await pause(Math.max(0, Date.parse(event.startsAt) - Date.now() + 80))
          await holder.query('commit')
          assert.equal((await pending).error, 'RA001')
          assert.equal((await state(event.id)).actual, 0)
        } finally {
          await holder.query('rollback').catch(() => {})
          if (pending) await pending
          await Promise.all([close(holder), close(joining)])
        }
        async function data(path: string, actor: Actor | undefined, method = 'POST', body?: unknown) {
          const options: RequestInit = {
            method,
            headers: {
              apikey: env.SUPABASE_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
              ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
            },
            signal: AbortSignal.timeout(5000),
          }
          if (body !== undefined) options.body = JSON.stringify(body)
          return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, options)
        }
        const open = await create()
        for (const actor of [undefined, one]) {
          assert.ok([401, 403].includes((await data('event_participants?select=*', actor, 'GET')).status))
          assert.ok(
            [401, 403].includes(
              (await data('event_participants', actor, 'POST', { event_id: open.id, profile_id: two.id }))
                .status,
            ),
          )
          assert.ok(
            [401, 403].includes(
              (await data(`event_participants?event_id=eq.${open.id}`, actor, 'DELETE')).status,
            ),
          )
        }
        assert.ok(
          [401, 403].includes(
            (await data('rpc/join_event', undefined, 'POST', { p_event_id: open.id })).status,
          ),
        )
        const joined = await data('rpc/join_event', one, 'POST', { p_event_id: open.id })
        assert.equal(joined.status, 200)
        assert.equal(((await joined.json()) as AttendanceResult).hasJoined, true)
        const forged = await data('rpc/join_event', one, 'POST', { p_event_id: open.id, p_user_id: two.id })
        assert.notEqual(forged.status, 200)
        assert.equal((await state(open.id)).actual, 1)
      },
    )
  },
)
