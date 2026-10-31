import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { QueryClient } from '@tanstack/react-query'

test('discussion transport preserves viewer/parent identity, plain text, bounded DTOs and session cleanup', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    define: { 'import.meta.env.VITE_API_ORIGIN': JSON.stringify('') },
  })
  const oldFetch = globalThis.fetch,
    oldWindow = globalThis.window
  try {
    globalThis.window = { location: { origin: 'http://localhost:5173' } }
    const { discussionApi, discussionPageSchema } = await server.ssrLoadModule(
      '/src/features/events/api/discussion-api.ts',
    )
    const { discussionKey } = await server.ssrLoadModule('/src/features/events/api/use-discussion.ts')
    const eventId = 'e5000000-0000-4000-8000-000000000001',
      viewerId = '45000000-0000-4000-8000-000000000002',
      id = '45000000-0000-4000-8000-000000000003'
    let current = true,
      calls = 0,
      last
    const session = { viewerId, getAccessToken: async () => (current ? 'synthetic-token' : null) }
    const page = {
      eventId,
      viewerId,
      kind: 'comments',
      items: [
        {
          id,
          parentId: null,
          author: { id: viewerId, displayName: 'Player' },
          body: '<script>alert(1)</script>',
          isHost: false,
          replyCount: 0,
          deleted: false,
          hidden: false,
          createdAt: '2030-01-01T00:00:00Z',
          editedAt: null,
          canEdit: true,
          canDelete: true,
        },
      ],
      nextCursor: null,
      permissions: {
        commentsOpen: true,
        reviewsOpen: false,
        canComment: true,
        canReview: false,
        canModerateComments: false,
        canModerateReviews: false,
        serverTime: '2030-01-01T00:00:00Z',
        endsAt: '2030-01-02T00:00:00Z',
        cancelled: false,
      },
    }
    globalThis.fetch = async (url, options) => {
      calls++
      last = { url, options }
      return Response.json(page)
    }
    const result = await discussionApi.list(eventId, 'comments', session, null, null)
    assert.equal(result.items[0].body, '<script>alert(1)</script>', 'plain text remains data')
    assert.equal(new URL(last.url).pathname, `/api/events/${eventId}/comments`)
    assert.equal(
      discussionPageSchema.safeParse({ ...page, items: [{ ...page.items[0], hidden: true }] }).success,
      false,
    )
    globalThis.fetch = async () => Response.json({ ...page, viewerId: id })
    await assert.rejects(discussionApi.list(eventId, 'comments', session, null, null))
    globalThis.fetch = async () => Response.json({ ...page, items: [{ ...page.items[0], parentId: id }] })
    await assert.rejects(discussionApi.list(eventId, 'comments', session, null, null))
    globalThis.fetch = async (url, options) => {
      last = { url, options }
      return Response.json({ eventId, viewerId, id })
    }
    await discussionApi.change(eventId, 'comments', session, {
      operation: 'create',
      parentId: id,
      body: 'A reply',
    })
    assert.equal(new URL(last.url).pathname, `/api/events/${eventId}/comments/${id}/replies`)
    assert.deepEqual(JSON.parse(last.options.body), { body: 'A reply' })
    assert.equal(JSON.stringify(last.options).includes(viewerId), false, 'No actor in wire payload')
    globalThis.fetch = async () => {
      current = false
      return Response.json({ eventId, viewerId, id })
    }
    await assert.rejects(
      discussionApi.change(eventId, 'comments', session, {
        operation: 'edit',
        id,
        body: 'Stale acknowledgement',
      }),
    )
    await assert.rejects(
      discussionApi.change(
        eventId,
        'reviews',
        { viewerId: null, getAccessToken: async () => null },
        { operation: 'create', rating: 5 },
      ),
    )
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(discussionApi.list(eventId, 'comments', session, null, null, controller.signal))
    const cache = new QueryClient()
    cache.setQueryData(discussionKey(eventId, viewerId), page)
    cache.removeQueries({ queryKey: ['persistent-event-details'] })
    assert.equal(
      cache.getQueryData(discussionKey(eventId, viewerId)),
      undefined,
      'Existing auth/suspension cleanup destroys discussion data',
    )
    cache.clear()
    assert.ok(calls > 0)
  } finally {
    globalThis.fetch = oldFetch
    globalThis.window = oldWindow
    await server.close()
  }
})
