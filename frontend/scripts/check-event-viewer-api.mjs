import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { QueryClient } from '@tanstack/react-query'

test('bounded event viewer client rejects stale identity and unsafe membership projections', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    define: { 'import.meta.env.VITE_API_ORIGIN': JSON.stringify('http://127.0.0.1:3001') },
  })
  const original = globalThis.fetch
  try {
    const { eventViewerApi: api } = await server.ssrLoadModule(
      '/src/features/events/api/event-viewer-api.ts',
    )
    const { persistentJoinEventOptions, persistentLeaveEventOptions } = await server.ssrLoadModule(
      '/src/features/events/api/use-persistent-event-actions.ts',
    )
    const id = '31000000-0000-4000-8000-000000000001',
      user = '41000000-0000-4000-8000-000000000001'
    const session = { viewerId: user, getAccessToken: async () => 'synthetic-viewer-token' }
    let calls = 0
    const payload = {
      userId: user,
      items: [
        { eventId: id, isHost: false, hasJoined: false, address: 'PRIVATE', dateOfBirth: 'PRIVATE' },
      ],
    }
    globalThis.fetch = async (url, options) => {
      calls++
      assert.equal(new URL(url).pathname, '/api/events/viewer-status')
      assert.equal(options.method, 'POST')
      assert.deepEqual(JSON.parse(options.body), { eventIds: [id] })
      assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer synthetic-viewer-token')
      return Response.json(payload)
    }
    await t.test('one batch request sends IDs only and strips extras', async () => {
      const result = await api.get([id], session)
      assert.deepEqual(result, {
        userId: user,
        items: [{ eventId: id, isHost: false, hasJoined: false }],
      })
      assert.equal(calls, 1)
    })
    await t.test('invalid/bounded inputs and missing actor never reach transport', async () => {
      const before = calls
      for (const ids of [
        [],
        [id, id],
        Array.from({ length: 51 }, (_, i) => `31000000-0000-4000-8000-${String(i).padStart(12, '0')}`),
        ['1'],
      ])
        await assert.rejects(api.get(ids, session))
      await assert.rejects(api.get([id], { viewerId: null, getAccessToken: async () => null }))
      assert.equal(calls, before)
    })
    await t.test(
      'wrong viewer, unrequested IDs, duplicates and contradictory flags fail closed',
      async () => {
        for (const value of [
          { ...payload, userId: '41000000-0000-4000-8000-000000000002' },
          {
            ...payload,
            items: [
              { eventId: '31000000-0000-4000-8000-000000000002', isHost: false, hasJoined: false },
            ],
          },
          { ...payload, items: [payload.items[0], payload.items[0]] },
          { ...payload, items: [{ eventId: id, isHost: true, hasJoined: true }] },
        ]) {
          globalThis.fetch = async () => Response.json(value)
          await assert.rejects(api.get([id], session))
        }
      },
    )
    await t.test('late account change and aborted response cannot publish membership', async () => {
      let token = 'synthetic-viewer-token'
      globalThis.fetch = async () => {
        token = null
        return Response.json(payload)
      }
      await assert.rejects(
        api.get([id], { viewerId: user, getAccessToken: async () => token }),
        /account changed/,
      )
      const abort = new AbortController()
      globalThis.fetch = async () => {
        abort.abort()
        return Response.json(payload)
      }
      await assert.rejects(api.get([id], session, abort.signal))
    })
    await t.test(
      'only confirmed attendance updates public counts and same-viewer batch flags',
      async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        client.setQueryData(['auth-account'], { id: user })
        const viewerKey = ['event-viewer-status', user, [id]],
          otherKey = ['event-viewer-status', '41000000-0000-4000-8000-000000000002', [id]]
        const self = [{ eventId: id, isHost: false, hasJoined: false }]
        client.setQueryData(viewerKey, self)
        let aborted = false
        const stale = client
          .fetchQuery({
            queryKey: viewerKey,
            queryFn: ({ signal }) =>
              new Promise((_resolve, reject) =>
                signal.addEventListener('abort', () => {
                  aborted = true
                  reject(signal.reason)
                }),
              ),
            retry: false,
          })
          .catch(() => {})
        client.setQueryData(otherKey, self)
        const summary = { id, capacity: 2, participantCount: 0, availableSlots: 2 }
        const listKey = ['persistent-events', {}],
          mine = ['my-events', user, 'joined', 'all']
        const page = { items: [summary], pageInfo: { limit: 12, nextCursor: null } }
        client.setQueryData(listKey, { pages: [page], pageParams: [null] })
        client.setQueryData(mine, { pages: [page], pageParams: [null] })
        globalThis.fetch = async () => Response.json({}, { status: 503 }) // Detail refresh fails after acknowledged join.
        const ack = { eventId: id, hasJoined: true, capacity: 2, participantCount: 1, availableSlots: 1 }
        await persistentJoinEventOptions(client).onSuccess(
          ack,
          { value: id, session },
          { viewerId: user },
          {},
        )
        assert.equal(client.getQueryData(viewerKey)[0].hasJoined, true)
        await stale
        assert.equal(
          aborted,
          true,
          'Acknowledged attendance cancels stale viewer reads before cache updates',
        )
        assert.equal(client.getQueryData(otherKey)[0].hasJoined, false)
        assert.equal(client.getQueryData(listKey).pages[0].items[0].participantCount, 1)
        assert.equal(client.getQueryData(mine).pages[0].items[0].availableSlots, 1)
        await persistentLeaveEventOptions(client).onSuccess(
          { ...ack, hasJoined: false, participantCount: 0, availableSlots: 2 },
          { value: id, session },
          { viewerId: user },
          {},
        )
        assert.equal(client.getQueryData(viewerKey)[0].hasJoined, false)
        assert.equal(client.getQueryData(listKey).pages[0].items[0].participantCount, 0)
        client.clear()
      },
    )
  } finally {
    globalThis.fetch = original
    await server.close()
  }
})
