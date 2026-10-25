import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'
import { test } from 'node:test'
import pg from 'pg'
import { buildApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createDatabaseClient } from '../../src/db/supabase.js'
import { validateLocalDatabaseUrl } from '../../scripts/geography/store.js'
import type {
  EventPage,
  HostEventDetails,
  ParticipantEventDetails,
  PublicEventDetails,
} from '../../src/modules/events/types.js'

type Actor = { id: string; token: string }
type Place = { id: number; countryId: number; name: string }

function assertPublic(value: unknown): void {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    assert.ok(
      ![
        'address',
        'email',
        'birthYear',
        'ageDeclaredAt',
        'role',
        'roomCode',
        'attendeeIds',
        'participantIds',
      ].includes(key),
      `Unexpected public field: ${key}`,
    )
    assertPublic(child)
  }
}

test(
  'local HTTP persistent event discovery, lifecycle and authorization',
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
    const db = new pg.Client({
      connectionString: validateLocalDatabaseUrl(process.env.GEOGRAPHY_DATABASE_URL),
    })
    await db.connect()
    const app = buildApp(env, { logger: false })
    const emails: string[] = [],
      actorIds: string[] = []
    t.after(async () => {
      await app.close()
      try {
        await db.query('delete from public.events where host_id=any($1::uuid[])', [actorIds])
        await db.query('delete from auth.users where email=any($1::text[])', [emails])
      } finally {
        await db.end()
      }
    })
    const origin = await app.listen({ host: '127.0.0.1', port: 0 })
    async function api(
      method: string,
      path: string,
      actor?: Actor,
      body?: unknown,
      headers: Record<string, string> = {},
    ): Promise<Response> {
      return fetch(new URL(path, origin), {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      })
    }
    async function json<T>(response: Response, status = 200): Promise<T> {
      assert.equal(response.status, status, 'Unexpected HTTP status; response credentials are not logged.')
      return (await response.json()) as T
    }
    async function account(): Promise<Actor> {
      const email = `events-integration-${randomUUID()}@example.test`
      emails.push(email)
      const auth = createDatabaseClient(env).auth
      const registered = await auth.signUp({
        email,
        password: `Rc!${randomUUID()}aA7`,
        options: { data: { role: 'superadmin' } },
      })
      assert.equal(Boolean(registered.error), false, 'Local registration must work.')
      const id = registered.data.user?.id
      assert.ok(id)
      actorIds.push(id)
      assert.equal(registered.data.session, null, 'Email confirmation remains enabled.')
      const stored = await db.query<{ confirmation_token: string }>(
        'select confirmation_token from auth.users where id=$1',
        [id],
      )
      const hash = stored.rows[0]?.confirmation_token
      assert.ok(hash)
      const confirmed = await auth.verifyOtp({ token_hash: hash, type: 'signup' })
      assert.equal(Boolean(confirmed.error), false)
      const token = confirmed.data.session?.access_token
      assert.ok(token)
      return { id, token }
    }
    const host = await account(),
      other = await account(),
      third = await account()
    const catalog = await json<{ id: number; name: string }[]>(await api('GET', '/api/games'))
    const foundGame = catalog.find((entry) => entry.name === 'Dungeons & Dragons')
    const foundMagic = catalog.find((entry) => entry.name === 'Magic: The Gathering')
    assert.ok(foundGame && foundMagic)
    const game = foundGame,
      magic = foundMagic
    const places: Record<string, Place> = {}
    for (const [country, query] of [
      ['ME', 'Podgorica'],
      ['RS', 'Beograd'],
      ['BA', 'Sarajevo'],
      ['HR', 'Zagreb'],
    ]) {
      const found = await json<Place[]>(
        await api('GET', `/api/cities?${new URLSearchParams({ country: country ?? '', q: query ?? '' })}`),
      )
      assert.ok(country && found[0])
      places[country] = found[0]
    }
    const foundMontenegro = places.ME,
      foundSerbia = places.RS
    assert.ok(foundMontenegro && foundSerbia)
    const montenegro = foundMontenegro,
      serbia = foundSerbia
    const prefix = `Event API ${randomUUID().slice(0, 8)}`
    const future = (days: number) => new Date(Date.now() + (30 + days) * 86400000).toISOString()
    function input(overrides: Record<string, unknown> = {}) {
      return {
        title: `${prefix} friendly table`,
        description: 'A welcoming workshop table for tabletop players.',
        gameId: game.id,
        cityId: montenegro.id,
        address: 'Synthetic private workshop address',
        startsAt: future(4),
        endsAt: future(4.1),
        capacity: 4,
        experienceLevel: 'all-levels',
        tags: ['Beginner friendly'],
        ...overrides,
      }
    }
    async function create(overrides: Record<string, unknown> = {}, actor = host): Promise<HostEventDetails> {
      const response = await api('POST', '/api/events', actor, input(overrides))
      const event = await json<HostEventDetails>(response, 201)
      assert.equal(response.headers.get('location'), `/api/events/${event.id}`)
      assert.equal(event.host.id, actor.id)
      assert.equal(event.address, input(overrides).address)
      return event
    }
    function path(filters: Record<string, string | number | boolean> = {}): string {
      return `/api/events?${new URLSearchParams(Object.entries({ search: prefix, ...filters }).map(([key, value]): [string, string] => [key, String(value)]))}`
    }
    let publicEvent: HostEventDetails, privateEvent: HostEventDetails, unlistedEvent: HostEventDetails

    await t.test(
      'public discovery combines real references, literal search, sorting and precise cursor pagination',
      async () => {
        const ids = new Set<string>()
        for (const [index, country] of ['ME', 'RS', 'BA', 'HR'].entries()) {
          const place = places[country]
          assert.ok(place)
          const event = await create({
            title: `${prefix} ${country} table`,
            cityId: place.id,
            gameId: country === 'RS' ? magic.id : game.id,
            startsAt: future(4 - index),
            endsAt: future(4.1 - index),
          })
          assert.equal(event.country.isoCode, country)
          assert.equal(event.venue, null)
          assert.equal(event.participantCount, 0)
          assert.equal(event.availableSlots, event.capacity)
          assert.equal(event.cover.kind, 'default')
          if (country === 'ME') publicEvent = event
          ids.add(event.id)
        }
        const precise = future(6).replace(/\.\d{3}Z$/, '.123456Z')
        await create({ title: `${prefix} Literal_% table`, startsAt: precise, endsAt: future(6.1) })
        await create({ title: `${prefix} LiteralAB table`, startsAt: precise, endsAt: future(6.1) })
        const page = await json<EventPage>(await api('GET', path()))
        assert.equal(page.items.length, 6)
        assert.deepEqual(
          page.items.map((event) => event.startsAt),
          [...page.items]
            .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id))
            .map((event) => event.startsAt),
        )
        assertPublic(page)
        for (const country of ['ME', 'RS', 'BA', 'HR']) {
          const countryPage = await json<EventPage>(
            await api('GET', path({ country: country.toLowerCase() })),
          )
          assert.ok(countryPage.items.length > 0)
          assert.ok(countryPage.items.every((event) => event.country.isoCode === country))
        }
        const combined = await json<EventPage>(
          await api('GET', path({ country: 'RS', cityId: serbia.id, gameId: magic.id, availableOnly: true })),
        )
        assert.equal(combined.items.length, 1)
        const literal = await json<EventPage>(await api('GET', path({ search: `${prefix} Literal_%` })))
        assert.equal(literal.items.length, 1, 'SQL wildcard characters are literal search text.')
        const seen: string[] = []
        let cursor: string | null = null
        for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
          const current: EventPage = await json<EventPage>(
            await api('GET', path({ limit: 1, ...(cursor ? { cursor } : {}) })),
          )
          assert.equal(current.items.length, 1)
          seen.push(current.items[0]?.id ?? '')
          cursor = current.pageInfo.nextCursor
          if (!cursor) break
        }
        assert.equal(seen.length, 6)
        assert.equal(new Set(seen).size, 6)
        assert.equal(cursor, null)
        assert.equal((await api('GET', '/api/events?limit=51')).status, 400)
        assert.equal((await api('GET', '/api/events?limit=1&limit=2')).status, 400)
        assert.equal((await api('GET', '/api/events?visibility=private')).status, 400)
        assert.equal((await api('GET', path({ country: 'ZZ' }))).status, 200)
        assert.equal(ids.size, 4)
      },
    )

    await t.test(
      'detail authorization protects private existence and addresses while recognizing existing participants',
      async () => {
        assert.ok(publicEvent)
        privateEvent = await create({ title: `${prefix} hidden table`, visibility: 'private' })
        unlistedEvent = await create({ title: `${prefix} direct link`, visibility: 'unlisted' })
        const cancelled = await create({ title: `${prefix} cancelled table` })
        await json<HostEventDetails>(
          await api('PATCH', `/api/events/${cancelled.id}`, host, { status: 'cancelled' }),
        )
        await db.query(
          'update private.event_locations set share_publicly=true where event_id=any($1::uuid[])',
          [[publicEvent.id, privateEvent.id, unlistedEvent.id]],
        )
        await db.query('insert into public.event_participants(event_id,profile_id) values($1,$2),($3,$2)', [
          publicEvent.id,
          other.id,
          privateEvent.id,
        ])
        await db.query("insert into private.account_roles(profile_id,role) values($1,'superadmin')", [
          third.id,
        ])
        const own = await json<HostEventDetails>(await api('GET', `/api/events/${privateEvent.id}`, host))
        assert.equal(own.address, privateEvent.address)
        for (const event of [publicEvent, unlistedEvent, cancelled])
          for (const actor of [undefined, other, third]) {
            const response = await api('GET', `/api/events/${event.id}`, actor)
            const detail = await json<PublicEventDetails | ParticipantEventDetails>(response)
            if (event.id === publicEvent.id && actor?.id === other.id) {
              assert.ok('address' in detail)
              const { address, ...safe } = detail
              assert.equal(address, publicEvent.address)
              assert.deepEqual(detail.viewer, { userId: other.id, isHost: false, hasJoined: true })
              assertPublic(safe)
            } else assertPublic(detail)
            assert.equal(response.headers.get('cache-control'), 'no-store')
          }
        const participant = await json<ParticipantEventDetails>(
          await api('GET', `/api/events/${privateEvent.id}`, other),
        )
        assert.equal(participant.address, privateEvent.address)
        assert.deepEqual(participant.viewer, { userId: other.id, isHost: false, hasJoined: true })
        const missing = await api('GET', `/api/events/${randomUUID()}`)
        const missingBody = await missing.text()
        assert.equal(missing.status, 404)
        for (const actor of [undefined, third]) {
          const hidden = await api('GET', `/api/events/${privateEvent.id}`, actor)
          assert.equal(hidden.status, 404)
          assert.equal(await hidden.text(), missingBody)
        }
        const listed = await json<EventPage>(await api('GET', path(), host))
        assert.equal(listed.items.length, 6)
        assert.ok(
          listed.items.every((event) => event.visibility === 'public' && event.status === 'scheduled'),
        )
        assert.equal((await api('GET', '/api/events/not-a-uuid')).status, 400)
        assert.equal(
          (
            await api('GET', `/api/events/${publicEvent.id}`, undefined, undefined, {
              Authorization: 'Bearer e30.e30.aW52YWxpZA',
            })
          ).status,
          401,
        )
      },
    )

    await t.test(
      'host CRUD validates merged values, preserves attendance, persists and cascades past/cancelled rows',
      async () => {
        assert.ok(publicEvent && privateEvent && unlistedEvent)
        assert.equal((await api('POST', '/api/events', undefined, input())).status, 401)
        for (const values of [
          { hostId: other.id },
          { countryId: montenegro.countryId },
          { participantCount: 2 },
          { coverStoragePath: 'data:image/png;base64,untrusted' },
          { gameId: 2147483647 },
          { cityId: 2147483647 },
          { tags: ['Veterans only'] },
          { tags: ['Casual', 'Casual'] },
        ])
          assert.equal((await api('POST', '/api/events', host, input(values))).status, 400)
        assert.equal(
          (await api('PATCH', `/api/events/${publicEvent.id}`, undefined, { title: 'Denied' })).status,
          401,
        )
        assert.equal(
          (await api('PATCH', `/api/events/${publicEvent.id}`, other, { title: 'Takeover' })).status,
          404,
        )
        assert.equal((await api('DELETE', `/api/events/${publicEvent.id}`, other)).status, 404)
        assert.equal(
          (await api('PATCH', `/api/events/${publicEvent.id}`, host, { hostId: other.id })).status,
          400,
        )
        assert.equal(
          (await api('PATCH', `/api/events/${publicEvent.id}`, host, { experienceLevel: 'experienced' }))
            .status,
          400,
        )
        assert.equal(
          (
            await api('PATCH', `/api/events/${publicEvent.id}`, host, {
              title: 'Should not persist',
              address: 'x',
            })
          ).status,
          400,
        )
        const before = await json<HostEventDetails>(await api('GET', `/api/events/${publicEvent.id}`, host))
        assert.equal(before.title, publicEvent.title)
        const changed = await json<HostEventDetails>(
          await api('PATCH', `/api/events/${publicEvent.id}`, host, {
            title: `${prefix} updated table`,
            address: 'Updated synthetic private address',
            cityId: serbia.id,
            venue: '  ',
          }),
        )
        assert.equal(changed.country.isoCode, 'RS')
        assert.equal(changed.host.id, host.id)
        assert.equal(changed.createdAt, before.createdAt)
        assert.equal(changed.participantCount, 1)
        assert.equal(changed.address, 'Updated synthetic private address')
        assert.equal(changed.venue, null)
        assert.ok(Date.parse(changed.updatedAt) >= Date.parse(before.updatedAt))
        await json<HostEventDetails>(
          await api('PATCH', `/api/events/${unlistedEvent.id}`, host, { visibility: 'private' }),
        )
        assert.equal((await api('GET', `/api/events/${unlistedEvent.id}`)).status, 404)
        await json<HostEventDetails>(
          await api('PATCH', `/api/events/${unlistedEvent.id}`, host, { visibility: 'public' }),
        )
        assert.equal((await api('GET', `/api/events/${unlistedEvent.id}`)).status, 200)
        const full = await create({ title: `${prefix} full table`, capacity: 2 })
        await db.query('insert into public.event_participants(event_id,profile_id) values($1,$2),($1,$3)', [
          full.id,
          other.id,
          third.id,
        ])
        assert.equal((await api('PATCH', `/api/events/${full.id}`, host, { capacity: 1 })).status, 409)
        const available = await json<EventPage>(
          await api('GET', path({ upcomingOnly: false, availableOnly: true })),
        )
        assert.ok(!available.items.some((event) => event.id === full.id))
        await json<HostEventDetails>(
          await api('PATCH', `/api/events/${full.id}`, host, { status: 'cancelled' }),
        )
        assert.equal((await api('DELETE', `/api/events/${full.id}`, host)).status, 204)
        assert.equal(
          (
            await db.query('select count(*)::int n from public.event_participants where event_id=$1', [
              full.id,
            ])
          ).rows[0].n,
          0,
        )
        assert.equal(
          (await db.query('select count(*)::int n from private.event_locations where event_id=$1', [full.id]))
            .rows[0].n,
          0,
        )
        const soon = new Date(Date.now() + 3000).toISOString()
        const past = await create({
          title: `${prefix} soon past table`,
          startsAt: soon,
          endsAt: new Date(Date.now() + 3600000).toISOString(),
        })
        await db.query('insert into public.event_participants(event_id,profile_id) values($1,$2)', [
          past.id,
          other.id,
        ])
        await pause(Math.max(0, Date.parse(soon) - Date.now() + 50))
        assert.equal(
          (await api('PATCH', `/api/events/${past.id}`, host, { address: 'Past address cannot change' }))
            .status,
          400,
        )
        assert.ok(
          !(await json<EventPage>(await api('GET', path()))).items.some((event) => event.id === past.id),
        )
        assert.ok(
          (await json<EventPage>(await api('GET', path({ upcomingOnly: false })))).items.some(
            (event) => event.id === past.id,
          ),
        )
        assert.equal((await api('DELETE', `/api/events/${past.id}`, host)).status, 204)
        assert.equal((await api('DELETE', `/api/events/${past.id}`, host)).status, 404)
        const freshApp = buildApp(env, { logger: false })
        try {
          const persisted = await freshApp.inject({
            url: `/api/events/${publicEvent.id}`,
            headers: { authorization: `Bearer ${host.token}` },
          })
          assert.equal(persisted.statusCode, 200)
          assert.equal(persisted.json<HostEventDetails>().address, changed.address)
        } finally {
          await freshApp.close()
        }
      },
    )

    await t.test('direct Data API cannot bypass closed tables, bounded RPCs or ownership', async () => {
      async function data(path: string, actor?: Actor, body?: unknown, method = 'POST') {
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
      for (const actor of [undefined, host, other]) {
        for (const table of ['events', 'event_participants'])
          assert.ok([401, 403].includes((await data(`${table}?select=*`, actor, undefined, 'GET')).status))
        assert.ok(
          [401, 403].includes((await data('events', actor, { title: 'Forbidden direct insert' })).status),
        )
      }
      for (const p_filters of [
        { limit: 51 },
        { limit: '2' },
        { visibility: 'private' },
        { status: 'cancelled' },
        { availableOnly: 'true' },
      ])
        assert.equal((await data('rpc/discover_events', undefined, { p_filters })).status, 400)
      const deniedUpdate = await data('rpc/update_event', other, {
        p_event_id: publicEvent.id,
        p_patch: { title: 'Forbidden' },
      })
      // PostgREST maps P0002 to 500; Fastify normalizes this database code to HTTP 404.
      assert.equal(deniedUpdate.status, 500)
      assert.equal(((await deniedUpdate.json()) as { code: string }).code, 'P0002')
      assert.ok([401, 403].includes((await data('rpc/create_event', undefined, { p_input: input() })).status))
      assert.equal(
        (await data('rpc/create_event', host, { p_input: input({ hostId: other.id }) })).status,
        400,
      )
      const hidden = await data('rpc/get_event', third, { p_event_id: privateEvent.id })
      const missing = await data('rpc/get_event', third, { p_event_id: randomUUID() })
      assert.equal(hidden.status, missing.status)
      assert.equal(await hidden.text(), await missing.text())
      const safe = await data('rpc/get_event', third, { p_event_id: publicEvent.id })
      assert.equal(safe.status, 200)
      assertPublic(await safe.json())
      const role = (
        await db.query<{ rolcanlogin: boolean; rolbypassrls: boolean }>(
          "select rolcanlogin,rolbypassrls from pg_roles where rolname='rollcall_events_executor'",
        )
      ).rows[0]
      assert.ok(role && !role.rolcanlogin && !role.rolbypassrls)
      assert.equal(
        (await db.query("select pg_has_role('authenticated','rollcall_events_executor','member') allowed"))
          .rows[0].allowed,
        false,
      )
    })
  },
)
