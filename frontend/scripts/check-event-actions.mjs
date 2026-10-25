import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { setTimeout as pause } from 'node:timers/promises'
import { createServer } from 'vite'
import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query'

const eventId = '10000000-0000-4000-8000-000000000001'
const hostId = '20000000-0000-4000-8000-000000000001'
const playerId = '20000000-0000-4000-8000-000000000002'
const secondPlayerId = '20000000-0000-4000-8000-000000000003'
const future = (offset = 0) => new Date(Date.now() + (30 + offset) * 86400000).toISOString()
const input = {
  title: 'A persistent workshop table',
  description: 'A welcoming table for real authenticated players.',
  gameId: 3,
  cityId: 40,
  address: 'Synthetic protected workshop address',
  startsAt: future(),
  endsAt: future(0.1),
  capacity: 4,
  experienceLevel: 'all-levels',
}
const host = {
  id: eventId,
  title: input.title,
  description: input.description,
  game: { id: 3, name: 'Dungeons & Dragons', category: 'role-playing' },
  city: { id: 40, name: 'Podgorica', administrativeDivision: null },
  country: { id: 1, isoCode: 'ME', name: 'Montenegro' },
  venue: null,
  startsAt: input.startsAt,
  endsAt: input.endsAt,
  capacity: 4,
  participantCount: 1,
  availableSlots: 3,
  tags: [],
  visibility: 'public',
  status: 'scheduled',
  cover: { kind: 'default', imageUrl: '/images/role-playing.svg' },
  host: { id: hostId, displayName: 'Real workshop host' },
  minimumAge: 0,
  experienceLevel: 'all-levels',
  price: 0,
  currency: 'EUR',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  viewer: { userId: hostId, isHost: true, hasJoined: false },
  address: input.address,
}
const participant = { ...host, viewer: { userId: playerId, isHost: false, hasJoined: true } }
const publicPlayer = { ...host, viewer: { userId: playerId, isHost: false, hasJoined: false } }
delete publicPlayer.address
const attendance = { eventId, hasJoined: true, capacity: 4, participantCount: 1, availableSlots: 3 }

function session(viewerId = hostId) {
  return { viewerId, getAccessToken: async () => 'synthetic-action-token' }
}

function statusIs(status) {
  return (error) => error.status === status
}

test('real event mutation requests, authorization, acknowledgements and cache safety', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    define: { 'import.meta.env.VITE_API_ORIGIN': JSON.stringify('http://127.0.0.1:3001') },
  })
  const originalFetch = globalThis.fetch
  const originalTimezone = process.env.TZ
  process.env.TZ = 'Europe/Budapest'
  try {
    const { persistentEventActionsApi: api } = await server.ssrLoadModule(
      '/src/features/events/api/persistent-event-actions-api.ts',
    )
    const hooks = await server.ssrLoadModule('/src/features/events/api/use-persistent-event-actions.ts')
    const { persistentEventFormSchema, persistentEventFormDefaults } = await server.ssrLoadModule(
      '/src/features/events/api/persistent-event-form-values.ts',
    )
    const { localDateTime, isoDateTime } = await server.ssrLoadModule(
      '/src/features/events/api/event-date-time.ts',
    )

    await t.test('real form mapping sends only backend fields and the confirmed city ID', () => {
      const draft = { ...persistentEventFormDefaults(host), venue: '  ' }
      const mapped = persistentEventFormSchema().parse(draft)
      assert.deepEqual(
        Object.keys(mapped).sort(),
        [
          'title',
          'description',
          'gameId',
          'cityId',
          'venue',
          'address',
          'startsAt',
          'endsAt',
          'capacity',
          'minimumAge',
          'experienceLevel',
          'price',
          'tags',
          'visibility',
          'coverStoragePath',
        ].sort(),
      )
      assert.equal(mapped.cityId, host.city.id)
      assert.equal(mapped.gameId, host.game.id)
      assert.equal(mapped.venue, null)
      assert.equal(mapped.coverStoragePath, null)
      assert.equal(mapped.startsAt, isoDateTime(draft.startsAt))
      assert.equal(localDateTime(mapped.startsAt), draft.startsAt)
      for (const forbidden of [
        'id',
        'hostId',
        'organizerId',
        'userId',
        'participantCount',
        'attendeeIds',
        'countryId',
        'countryCode',
        'city',
        'location',
        'imageUrl',
      ])
        assert.equal(forbidden in mapped, false)
      for (const visibility of ['public', 'private', 'unlisted'])
        assert.equal(persistentEventFormSchema().parse({ ...draft, visibility }).visibility, visibility)
      assert.equal(draft.countryCode, 'ME')
      assert.equal(draft.location.countryId, host.country.id)
      assert.equal(draft.location.cityId, host.city.id)
    })

    await t.test(
      'real form rejects unconfirmed or inconsistent locations, custom images and invalid capacity/schedule',
      () => {
        const draft = persistentEventFormDefaults(host)
        for (const [changes, expectedField] of [
          [{ location: null }, 'location'],
          [{ countryCode: '' }, 'countryCode'],
          [{ countryCode: 'RS' }, 'location'],
          [{ city: 'Unconfirmed city text' }, 'location'],
          [{ imageUrl: 'data:image/png;base64,mock-cover' }, 'imageUrl'],
          [{ imageUrl: 'https://example.test/not-an-upload.png' }, 'imageUrl'],
          [{ startsAt: '2020-01-01T12:00' }, 'startsAt'],
          [{ capacity: 0 }, 'capacity'],
        ]) {
          const parsed = persistentEventFormSchema().safeParse({ ...draft, ...changes })
          assert.equal(parsed.success, false)
          assert.ok(
            parsed.error.issues.some((issue) => issue.path[0] === expectedField),
            `Expected ${expectedField} validation.`,
          )
        }
        assert.equal(persistentEventFormSchema().safeParse({ ...draft, organizerId: 1 }).success, false)
        const occupied = { ...host, participantCount: 2, availableSlots: 2 }
        const capacity = persistentEventFormSchema(occupied).safeParse({
          ...persistentEventFormDefaults(occupied),
          capacity: 1,
        })
        assert.equal(capacity.success, false)
        assert.ok(capacity.error.issues.some((issue) => issue.path[0] === 'capacity'))
      },
    )

    await t.test(
      'local date conversion rejects DST gaps and preserves unchanged seconds, microseconds and overlap offsets',
      () => {
        const year = new Date().getUTCFullYear() + 1
        // Assert the actual timezone behavior instead of silently testing UTC on a host
        // that did not apply the dynamic TZ setting.
        assert.equal(new Date(`${year}-01-15T12:00:00`).getTimezoneOffset(), -60)
        assert.equal(new Date(`${year}-07-15T12:00:00`).getTimezoneOffset(), -120)
        const lastSunday = (month) => {
          const date = new Date(Date.UTC(year, month + 1, 0))
          return String(date.getUTCDate() - date.getUTCDay()).padStart(2, '0')
        }
        const skipped = `${year}-03-${lastSunday(2)}T02:30`
        assert.equal(isoDateTime(skipped), '')
        assert.equal(isoDateTime(`${year}-02-30T12:00`), '')
        const local = `${year}-06-15T18:45`
        assert.equal(isoDateTime(local), `${year}-06-15T16:45:00.000Z`)
        assert.equal(localDateTime(isoDateTime(local)), local)
        const overlap = `${year}-10-${lastSunday(9)}T02:30`
        const original = {
          ...host,
          startsAt: `${overlap}:47.123456+02:00`,
          endsAt: `${overlap}:51.654321+01:00`,
        }
        const defaults = persistentEventFormDefaults(original)
        assert.equal(defaults.startsAt, overlap)
        assert.equal(defaults.endsAt, overlap)
        const unchanged = persistentEventFormSchema(original).parse({
          ...defaults,
          title: 'Changed title only',
        })
        assert.equal(unchanged.startsAt, original.startsAt)
        assert.equal(unchanged.endsAt, original.endsAt)
        const changedLocal = `${year}-10-${lastSunday(9)}T04:00`
        const edited = persistentEventFormSchema(original).parse({ ...defaults, endsAt: changedLocal })
        assert.equal(edited.startsAt, original.startsAt)
        assert.equal(edited.endsAt, isoDateTime(changedLocal))
        const invalid = persistentEventFormSchema().safeParse({
          ...persistentEventFormDefaults(host),
          startsAt: skipped,
        })
        assert.equal(invalid.success, false)
        assert.ok(invalid.error.issues.some((issue) => issue.path[0] === 'startsAt'))
      },
    )

    await t.test(
      'all five actions send allowlisted payloads with verified tokens and validate normal responses',
      async () => {
        const calls = []
        globalThis.fetch = async (url, options) => {
          calls.push({
            path: new URL(String(url)).pathname,
            method: options.method,
            headers: new Headers(options.headers),
            body: options.body && JSON.parse(options.body),
            redirect: options.redirect,
          })
          if (String(url).endsWith('/attendees/me'))
            return Response.json({
              ...attendance,
              hasJoined: options.method === 'POST',
              address: 'Must be stripped',
              role: 'admin',
            })
          if (options.method === 'DELETE') return new Response(null, { status: 204 })
          return Response.json(
            { ...host, email: 'private@example.test', birthYear: 1980, role: 'admin' },
            { status: options.method === 'POST' ? 201 : 200 },
          )
        }
        assert.deepEqual(await api.create(input, session()), host)
        assert.deepEqual(calls[0].body, {
          ...input,
          venue: null,
          minimumAge: 0,
          price: 0,
          tags: [],
          visibility: 'public',
          coverStoragePath: null,
        })
        assert.deepEqual(await api.update(eventId, { venue: '', title: 'Updated table' }, session()), host)
        assert.deepEqual(calls[1].body, { venue: null, title: 'Updated table' })
        assert.equal(await api.remove(eventId, session()), undefined)
        assert.deepEqual(await api.join(eventId, session(playerId)), attendance)
        assert.deepEqual(await api.leave(eventId, session(playerId)), { ...attendance, hasJoined: false })
        assert.deepEqual(
          calls.map((call) => call.method),
          ['POST', 'PATCH', 'DELETE', 'POST', 'DELETE'],
        )
        for (const call of calls) {
          assert.equal(call.headers.get('Authorization'), 'Bearer synthetic-action-token')
          assert.equal(call.redirect, 'error')
          assert.ok(!call.path.includes('synthetic-action-token'))
        }
        assert.equal(calls[2].body, undefined)
        assert.equal(calls[3].body, undefined)
        assert.equal(calls[4].body, undefined)
      },
    )

    await t.test('forged owners/images/actors, invalid IDs and invalid forms fail before HTTP', async () => {
      let calls = 0
      globalThis.fetch = async () => {
        calls++
        throw new Error('Unexpected request')
      }
      for (const extra of [
        { hostId },
        { organizerId: 1 },
        { participantCount: 9 },
        { countryId: 1 },
        { imageUrl: 'data:image/png;base64,invalid' },
        { coverStoragePath: 'untrusted/path' },
        { tags: ['Casual', 'Casual'] },
        { capacity: 0 },
        { startsAt: '2020-01-01T00:00:00Z' },
        { tags: ['Veterans only'] },
      ])
        await assert.rejects(api.create({ ...input, ...extra }, session()), statusIs(400))
      await assert.rejects(api.update(eventId, {}, session()), statusIs(400))
      await assert.rejects(api.update(eventId, { userId: playerId }, session()), statusIs(400))
      for (const operation of ['remove', 'join', 'leave'])
        await assert.rejects(api[operation]('1', session()), statusIs(400))
      await assert.rejects(api.create(input, session(null)), statusIs(401))
      await assert.rejects(api.create(input, session('1')), statusIs(401))
      assert.equal(calls, 0)
    })

    await t.test(
      'bad host/attendance acknowledgements fail closed and errors retain safe codes and fields',
      async () => {
        for (const body of [
          { ...host, host: { ...host.host, id: playerId } },
          { ...host, viewer: { userId: playerId, isHost: false, hasJoined: true } },
          { malformed: true },
        ]) {
          globalThis.fetch = async () => Response.json(body)
          await assert.rejects(api.create(input, session()))
        }
        for (const body of [
          { ...attendance, eventId: playerId },
          { ...attendance, hasJoined: false },
          { ...attendance, availableSlots: 5 },
          { ...attendance, participantCount: 0, availableSlots: 4 },
        ]) {
          globalThis.fetch = async () => Response.json(body)
          await assert.rejects(api.join(eventId, session(playerId)))
        }
        for (const [status, code] of [
          [400, 'VALIDATION_ERROR'],
          [401, 'UNAUTHENTICATED'],
          [403, 'FORBIDDEN'],
          [404, 'NOT_FOUND'],
          [409, 'CONFLICT'],
        ]) {
          globalThis.fetch = async () =>
            Response.json(
              {
                code,
                message:
                  status === 409
                    ? 'Capacity cannot be lower than current attendance.'
                    : 'sensitive upstream diagnostics',
                fields: { capacity: ['Keep enough seats.'] },
              },
              { status },
            )
          await assert.rejects(api.update(eventId, { capacity: 1 }, session()), (error) => {
            assert.equal(error.status, status)
            assert.equal(error.code, code)
            assert.ok(!error.message.includes('sensitive'))
            if ([400, 409].includes(status))
              assert.deepEqual(error.fields, { capacity: ['Keep enough seats.'] })
            return true
          })
        }
      },
    )

    await t.test('identity checks reject switches before and after a committed HTTP response', async () => {
      let calls = 0
      globalThis.fetch = async () => {
        calls++
        return Response.json(host, { status: 201 })
      }
      await assert.rejects(
        api.create(input, {
          viewerId: hostId,
          getAccessToken: async () => {
            throw new Error('Account changed')
          },
        }),
        /Account changed/,
      )
      assert.equal(calls, 0)
      let tokenReads = 0
      await assert.rejects(
        api.create(input, {
          viewerId: hostId,
          getAccessToken: async () => {
            if (++tokenReads > 1) throw new Error('Account changed')
            return 'synthetic-action-token'
          },
        }),
        /Account changed/,
      )
      assert.equal(calls, 1)
    })

    await t.test(
      'public leave cancels stale reads and immediately notifies active observers with an address-free DTO',
      async () => {
        const client = new QueryClient()
        const key = ['persistent-event-details', eventId, playerId]
        const secondKey = ['persistent-event-details', eventId, secondPlayerId]
        client.setQueryData(['auth-account'], { id: playerId })
        client.setQueryData(key, participant)
        client.setQueryData(secondKey, {
          ...participant,
          viewer: { userId: secondPlayerId, isHost: false, hasJoined: true },
        })
        let releaseOld,
          releaseFresh,
          aborted = false,
          reads = 0
        const old = new Promise((resolve) => {
          releaseOld = resolve
        })
        const fresh = new Promise((resolve) => {
          releaseFresh = resolve
        })
        const observer = new QueryObserver(client, {
          queryKey: key,
          queryFn: ({ signal }) => {
            reads++
            if (reads === 1) {
              signal.addEventListener('abort', () => {
                aborted = true
              })
              return old
            }
            return fresh
          },
          staleTime: 0,
        })
        const seen = []
        const unsubscribe = observer.subscribe((state) => seen.push(state.data))
        globalThis.fetch = async () =>
          Response.json({ ...attendance, hasJoined: false, participantCount: 0, availableSlots: 4 })
        try {
          const mutation = new MutationObserver(client, hooks.persistentLeaveEventOptions(client))
          await mutation.mutate({ value: eventId, session: session(playerId) })
          const current = client.getQueryData(key)
          assert.equal(current.viewer.hasJoined, false)
          assert.equal(current.participantCount, 0)
          assert.ok(!('address' in current))
          assert.equal(client.getQueryData(secondKey), undefined)
          assert.equal(aborted, true)
          assert.ok(seen.some((value) => value && !value.viewer.hasJoined && !('address' in value)))
          releaseOld(participant)
          await pause(0)
          assert.ok(!('address' in client.getQueryData(key)))
          releaseFresh({ ...publicPlayer, participantCount: 0, availableSlots: 4 })
        } finally {
          releaseOld(participant)
          releaseFresh(publicPlayer)
          unsubscribe()
          client.clear()
        }
      },
    )

    await t.test(
      'private leave and delete remove protected entries and invalidate all public discovery scopes',
      async () => {
        const client = new QueryClient()
        const key = ['persistent-event-details', eventId, playerId]
        const publicKey = ['persistent-events', { limit: 12 }, '']
        const homeKey = ['persistent-events', { limit: 3 }, '']
        client.setQueryData(['auth-account'], { id: playerId })
        client.setQueryData(key, { ...participant, visibility: 'private' })
        client.setQueryData(publicKey, { pages: [], pageParams: [] })
        client.setQueryData(homeKey, { pages: [], pageParams: [] })
        try {
          globalThis.fetch = async () =>
            Response.json({ ...attendance, hasJoined: false, participantCount: 0, availableSlots: 4 })
          await new MutationObserver(client, hooks.persistentLeaveEventOptions(client)).mutate({
            value: eventId,
            session: session(playerId),
          })
          assert.equal(client.getQueryData(key), undefined)
          assert.equal(client.getQueryState(publicKey).isInvalidated, true)
          assert.equal(client.getQueryState(homeKey).isInvalidated, true)
          client.setQueryData(['auth-account'], { id: hostId })
          client.setQueryData(['persistent-event-details', eventId, hostId], host)
          globalThis.fetch = async () => new Response(null, { status: 204 })
          await new MutationObserver(client, hooks.persistentDeleteEventOptions(client)).mutate({
            value: eventId,
            session: session(),
          })
          assert.equal(
            client.getQueryCache().findAll({ queryKey: ['persistent-event-details', eventId] }).length,
            0,
          )
        } finally {
          client.clear()
        }
      },
    )

    await t.test(
      'an account switch aborts an in-flight mutation and cannot populate another viewer cache',
      async () => {
        const client = new QueryClient()
        client.setQueryData(['auth-account'], { id: hostId })
        const secondKey = ['persistent-event-details', eventId, playerId]
        client.setQueryData(secondKey, publicPlayer)
        let started,
          release,
          aborted = false
        const began = new Promise((resolve) => {
          started = resolve
        })
        const response = new Promise((resolve) => {
          release = resolve
        })
        globalThis.fetch = async (_url, options) => {
          options.signal.addEventListener('abort', () => {
            aborted = true
          })
          started()
          return response
        }
        try {
          const mutation = new MutationObserver(client, hooks.persistentCreateEventOptions(client))
          const pending = mutation.mutate({ value: input, session: session() })
          await began
          client.setQueryData(['auth-account'], { id: playerId })
          release(Response.json(host, { status: 201 }))
          await assert.rejects(pending, statusIs(401))
          assert.equal(aborted, true)
          assert.deepEqual(client.getQueryData(secondKey), publicPlayer)
          assert.equal(client.getQueryData(['persistent-event-details', eventId, hostId]), undefined)
        } finally {
          release(Response.json(host))
          client.clear()
        }
      },
    )

    await t.test(
      'a successful join reads real authorized details, while a failed refresh does not falsify its acknowledgement',
      async () => {
        const client = new QueryClient()
        client.setQueryData(['auth-account'], { id: playerId })
        const key = ['persistent-event-details', eventId, playerId]
        let calls = 0
        globalThis.fetch = async (_url, options) => {
          calls++
          return Response.json(options.method === 'POST' ? attendance : participant)
        }
        try {
          const joined = await new MutationObserver(client, hooks.persistentJoinEventOptions(client)).mutate({
            value: eventId,
            session: session(playerId),
          })
          assert.equal(joined.hasJoined, true)
          assert.equal(client.getQueryData(key).address, input.address)
          assert.equal(calls, 2)
          globalThis.fetch = async (_url, options) =>
            options.method === 'POST'
              ? Response.json(attendance)
              : Response.json({ code: 'DEPENDENCY_UNAVAILABLE' }, { status: 503 })
          const repeated = await new MutationObserver(
            client,
            hooks.persistentJoinEventOptions(client),
          ).mutate({ value: eventId, session: session(playerId) })
          assert.equal(repeated.hasJoined, true)
          assert.equal(client.getQueryState(key).status, 'error')
        } finally {
          client.clear()
        }
      },
    )
  } finally {
    globalThis.fetch = originalFetch
    if (originalTimezone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimezone
    await server.close()
  }
})
