import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query'
import { setTimeout as pause } from 'node:timers/promises'

const eventId = '10000000-0000-4000-8000-000000000001'
const hostId = '20000000-0000-4000-8000-000000000001'
const playerId = '20000000-0000-4000-8000-000000000002'
const summary = {
  id: eventId,
  title: 'A real persistent table',
  game: { id: 3, name: 'Dungeons & Dragons', category: 'role-playing' },
  city: { id: 40, name: 'Podgorica', administrativeDivision: null },
  country: { id: 1, isoCode: 'ME', name: 'Montenegro' },
  venue: null,
  startsAt: '2027-01-01T18:00:00.123456Z',
  endsAt: '2027-01-01T22:00:00Z',
  capacity: 4,
  participantCount: 1,
  availableSlots: 3,
  tags: ['Beginner friendly'],
  visibility: 'public',
  status: 'scheduled',
  cover: { kind: 'default', imageUrl: '/images/role-playing.svg' },
}
const detail = {
  ...summary,
  description: 'A welcoming persistent event read from the backend.',
  host: { id: hostId, displayName: 'Real account host' },
  minimumAge: 0,
  experienceLevel: 'all-levels',
  price: 0,
  currency: 'EUR',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  viewer: { userId: null, isHost: false, hasJoined: false },
}
const page = { items: [summary], pageInfo: { limit: 12, nextCursor: null } }

test('persistent event HTTP client contracts, privacy and identity isolation', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    define: { 'import.meta.env.VITE_API_ORIGIN': JSON.stringify('http://127.0.0.1:3001') },
  })
  const originalFetch = globalThis.fetch
  try {
    const { persistentEventsApi: api } = await server.ssrLoadModule(
      '/src/features/events/api/persistent-events-api.ts',
    )
    const { isEventId } = await server.ssrLoadModule('/src/features/events/api/event-dtos.ts')
    const { persistentEventsQueryOptions } = await server.ssrLoadModule(
      '/src/features/events/api/use-persistent-events.ts',
    )
    await t.test(
      'changing filters discards accumulated pages and returning starts with the first cursor',
      async () => {
        const requests = []
        globalThis.fetch = async (input) => {
          const url = new URL(String(input))
          const cursor = url.searchParams.get('cursor')
          requests.push({ search: url.searchParams.get('search'), cursor })
          return Response.json({
            items: [{ ...summary, id: cursor ? '10000000-0000-4000-8000-000000000002' : eventId }],
            pageInfo: { limit: 1, nextCursor: cursor ? null : 'next-position' },
          })
        }
        const client = new QueryClient()
        const observers = []
        const unsubscribes = []
        function observe(search) {
          const observer = new InfiniteQueryObserver(
            client,
            persistentEventsQueryOptions({ search, limit: 1 }),
          )
          observers.push(observer)
          const unsubscribe = observer.subscribe(() => {})
          unsubscribes.push(unsubscribe)
          return { observer, unsubscribe }
        }
        try {
          const first = observe('Alpha')
          await first.observer.refetch()
          const loaded = await first.observer.fetchNextPage()
          assert.equal(loaded.data.pages.length, 2)
          first.unsubscribe()
          const second = observe('Beta')
          await second.observer.refetch()
          await pause(20)
          assert.equal(
            client.getQueryData(persistentEventsQueryOptions({ search: 'Alpha', limit: 1 }).queryKey),
            undefined,
          )
          second.unsubscribe()
          const returned = observe('Alpha')
          const reset = await returned.observer.refetch()
          assert.equal(reset.data.pages.length, 1)
          assert.deepEqual(requests.at(-1), { search: 'Alpha', cursor: null })
        } finally {
          for (const unsubscribe of unsubscribes) unsubscribe()
          for (const observer of observers) observer.destroy()
          client.clear()
        }
      },
    )
    await t.test(
      'discovery sends actual filters and cursor without authentication and strips private extras',
      async () => {
        const requests = []
        globalThis.fetch = async (input, options) => {
          requests.push({ url: new URL(String(input)), options })
          return Response.json({
            ...page,
            items: [{ ...summary, address: 'Must not appear', email: 'private@example.test', price: 99 }],
            pageInfo: { limit: 2, nextCursor: 'cursor-position' },
          })
        }
        const result = await api.list(
          {
            search: 'Table & friends',
            country: 'me',
            cityId: 40,
            gameId: 3,
            availableOnly: true,
            upcomingOnly: true,
            limit: 2,
          },
          'previous-position',
        )
        assert.deepEqual(result.items, [summary])
        assert.equal(result.pageInfo.nextCursor, 'cursor-position')
        const request = requests[0]
        assert.equal(request.url.origin, 'http://127.0.0.1:3001')
        assert.equal(request.url.pathname, '/api/events')
        assert.deepEqual(Object.fromEntries(request.url.searchParams), {
          search: 'Table & friends',
          country: 'ME',
          cityId: '40',
          gameId: '3',
          upcomingOnly: 'true',
          availableOnly: 'true',
          limit: '2',
          cursor: 'previous-position',
        })
        assert.equal(new Headers(request.options.headers).has('Authorization'), false)
        assert.equal(request.options.cache, 'no-store')
        assert.equal(request.options.redirect, 'error')
      },
    )
    await t.test('invalid UUIDs, filters and cursor values fail before network access', async () => {
      let calls = 0
      globalThis.fetch = async () => {
        calls++
        return Response.json(page)
      }
      for (const filters of [
        { gameId: -1 },
        { cityId: 0 },
        { limit: 51 },
        { availableOnly: 'true' },
        { visibility: 'private' },
        { search: 'x'.repeat(101) },
        { startsAfter: '2027-02-01T00:00:00Z', startsBefore: '2027-01-01T00:00:00Z' },
      ])
        await assert.rejects(api.list(filters), (error) => error.status === 400)
      await assert.rejects(api.list({}, 'cursor=bad'), (error) => error.status === 400)
      for (const id of ['1', 'not-a-uuid', 'https://unrelated.example/api/events']) {
        assert.equal(isEventId(id), false)
        await assert.rejects(
          api.get(id, null, async () => null),
          (error) => error.status === 400,
        )
      }
      assert.equal(calls, 0)
    })
    await t.test(
      'anonymous and unrelated details omit addresses while verified host/participant details retain them',
      async () => {
        let authorization
        let payload = {
          ...detail,
          address: 'A protected residential address',
          email: 'private@example.test',
          birthYear: 1980,
          role: 'admin',
        }
        globalThis.fetch = async (_input, options) => {
          authorization = new Headers(options.headers).get('Authorization')
          return Response.json(payload)
        }
        assert.deepEqual(await api.get(eventId, null, async () => null), detail)
        assert.equal(authorization, null)
        payload = { ...payload, viewer: { userId: playerId, isHost: false, hasJoined: false } }
        const unrelated = await api.get(eventId, playerId, async () => 'synthetic-access-token')
        assert.equal('address' in unrelated, false)
        assert.equal(authorization, 'Bearer synthetic-access-token')
        for (const [id, viewer] of [
          [hostId, { userId: hostId, isHost: true, hasJoined: false }],
          [playerId, { userId: playerId, isHost: false, hasJoined: true }],
        ]) {
          payload = { ...payload, visibility: 'private', viewer }
          const result = await api.get(eventId, id, async () => 'synthetic-access-token')
          assert.equal(result.address, payload.address)
          assert.equal('email' in result, false)
          assert.equal('birthYear' in result, false)
          assert.equal('role' in result, false)
        }
      },
    )
    await t.test('viewer mismatch, contradictory membership and malformed counts fail closed', async () => {
      for (const payload of [
        {
          ...detail,
          viewer: { userId: hostId, isHost: true, hasJoined: false },
          address: 'Protected address',
        },
        {
          ...detail,
          viewer: { userId: playerId, isHost: true, hasJoined: false },
          address: 'Protected address',
        },
        { ...detail, viewer: { userId: null, isHost: false, hasJoined: true }, address: 'Protected address' },
        {
          ...detail,
          viewer: { userId: playerId, isHost: false, hasJoined: true },
          participantCount: 0,
          availableSlots: 4,
          address: 'Protected address',
        },
        { ...detail, viewer: { userId: playerId, isHost: false, hasJoined: false }, availableSlots: 0 },
        { ...detail, viewer: { userId: playerId, isHost: false, hasJoined: false }, visibility: 'private' },
      ]) {
        globalThis.fetch = async () => Response.json(payload)
        await assert.rejects(api.get(eventId, playerId, async () => 'synthetic-access-token'))
      }
      for (const payload of [
        { ...page, items: [{ ...summary, visibility: 'private' }] },
        {
          ...page,
          items: [
            { ...summary, cover: { kind: 'default', imageUrl: 'https://unrelated.example/image.svg' } },
          ],
        },
        { items: [], pageInfo: { limit: 12, nextCursor: 'position' } },
      ]) {
        globalThis.fetch = async () => Response.json(payload)
        await assert.rejects(api.list())
      }
    })
    await t.test('account changes before and after HTTP cannot accept a protected response', async () => {
      let calls = 0
      globalThis.fetch = async () => {
        calls++
        return Response.json({
          ...detail,
          viewer: { userId: hostId, isHost: true, hasJoined: false },
          address: 'Protected address',
        })
      }
      await assert.rejects(
        api.get(eventId, hostId, async () => null),
        (error) => error.status === 401,
      )
      assert.equal(calls, 0)
      let checks = 0
      await assert.rejects(
        api.get(eventId, hostId, async () => (++checks === 1 ? 'synthetic-access-token' : null)),
        (error) => error.status === 401,
      )
      assert.equal(calls, 1)
      assert.equal(checks, 2)
      await assert.rejects(
        api.get(eventId, null, async () => 'synthetic-access-token'),
        (error) => error.status === 401,
      )
      assert.equal(calls, 1)
    })
    await t.test('HTTP errors are sanitized and request cancellation reaches the transport', async () => {
      for (const status of [400, 401, 403, 404, 503]) {
        globalThis.fetch = async () =>
          Response.json({ message: 'Private upstream details and credentials' }, { status })
        await assert.rejects(
          api.list(),
          (error) => error.status === status && !error.message.includes('Private upstream'),
        )
      }
      globalThis.fetch = async () => {
        throw new Error('Sensitive upstream origin')
      }
      await assert.rejects(api.list(), /event service is unavailable/i)
      const abort = new AbortController()
      let transport
      globalThis.fetch = (_input, options) => {
        transport = options.signal
        return new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
            once: true,
          }),
        )
      }
      const pending = api.list({}, null, abort.signal)
      abort.abort()
      await assert.rejects(pending)
      assert.equal(transport.aborted, true)
    })
  } finally {
    globalThis.fetch = originalFetch
    await server.close()
  }
})
