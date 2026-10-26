import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
test('report and moderation clients preserve identity and narrow request/response contracts', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    define: { 'import.meta.env.VITE_API_ORIGIN': JSON.stringify('http://127.0.0.1:3001') },
  })
  const originalFetch = globalThis.fetch
  try {
    const { submitEventReport } = await server.ssrLoadModule('/src/features/events/api/event-reports-api.ts')
    const { moderationApi } = await server.ssrLoadModule('/src/features/users/api/moderation-api.ts')
    const { authApi } = await server.ssrLoadModule('/src/features/users/api/auth-api.ts')
    const actor = '10000000-0000-4000-8000-000000000001',
      id = '20000000-0000-4000-8000-000000000002'
    let current = actor
    authApi.accessToken = async (expected) => {
      if (expected !== current) throw Error('Account changed')
      return 'synthetic-test-token'
    }
    const session = { viewerId: actor, getAccessToken: () => authApi.accessToken(actor) },
      signal = () => new AbortController().signal
    await t.test('submission sends only the reason and bounded plain description', async () => {
      let body, path
      globalThis.fetch = async (url, options) => {
        path = new URL(url).pathname
        body = JSON.parse(options.body)
        return Response.json({ id, created: true })
      }
      await submitEventReport(
        id,
        { reason: 'unsafe', description: '  Plain text concern.  ' },
        session,
        signal(),
      )
      assert.equal(path, `/api/events/${id}/reports`)
      assert.deepEqual(body, { reason: 'unsafe', description: 'Plain text concern.' })
      await assert.rejects(
        submitEventReport(id, { reason: 'unsafe', description: 'x'.repeat(1001) }, session, signal()),
      )
    })
    await t.test(
      'failed submissions do not acknowledge success and late account switches discard replies',
      async () => {
        globalThis.fetch = async () =>
          Response.json(
            { code: 'DEPENDENCY_UNAVAILABLE', message: 'Unavailable', fields: {} },
            { status: 503 },
          )
        await assert.rejects(submitEventReport(id, { reason: 'spam', description: '' }, session, signal()))
        globalThis.fetch = async () => {
          current = 'different-account'
          return Response.json({ id, created: true })
        }
        await assert.rejects(submitEventReport(id, { reason: 'spam', description: '' }, session, signal()))
        let requested = false
        globalThis.fetch = async () => {
          requested = true
          throw Error('No network allowed')
        }
        await assert.rejects(moderationApi.list(actor, 'open', null, signal()))
        assert.equal(requested, false)
        current = actor
      },
    )
    await t.test('decisions bind a report UUID and contain no event or moderator identity', async () => {
      let path, body
      globalThis.fetch = async (url, options) => {
        path = new URL(url).pathname
        body = JSON.parse(options.body)
        return Response.json({ id, eventId: id, status: 'actioned', changed: true })
      }
      await moderationApi.decide(actor, id, 'take-action', '  Reviewed safety concern.  ', signal())
      assert.equal(path, `/api/admin/event-reports/${id}/take-action`)
      assert.deepEqual(body, { note: 'Reviewed safety concern.' })
      assert.throws(() => moderationApi.decide(actor, id, 'dismiss', 'bad', signal()))
    })
    await t.test(
      'queue projections discard unrelated private fields and preserve exact cursors',
      async () => {
        const createdAt = '2026-10-26T10:00:00.123456+00:00'
        let query
        globalThis.fetch = async (url) => {
          query = new URL(url).searchParams
          return Response.json({
            items: [
              {
                id,
                eventId: id,
                eventAvailable: true,
                eventContext: {
                  title: 'Synthetic event',
                  game: 'Board games',
                  startsAt: createdAt,
                  visibility: 'private',
                  address: 'must be discarded',
                },
                eventStatus: 'scheduled',
                reason: 'unsafe',
                description: null,
                status: 'open',
                createdAt,
                updatedAt: createdAt,
                resolvedAt: null,
                resolutionNote: null,
                reporterId: actor,
                email: 'discarded@example.test',
                code: 'discarded',
              },
            ],
            nextCursor: { id, createdAt },
          })
        }
        const result = await moderationApi.list(actor, 'open', { id, createdAt }, signal())
        assert.equal(query.get('beforeTime'), createdAt)
        assert.equal(query.get('beforeId'), id)
        for (const field of ['reporterId', 'email', 'code']) assert.equal(field in result.items[0], false)
        assert.equal('address' in result.items[0].eventContext, false)
        assert.equal(result.nextCursor.createdAt, createdAt)
      },
    )
  } finally {
    globalThis.fetch = originalFetch
    await server.close()
  }
})
