import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

test('lifecycle boundaries and bounded, deduplicated, sanitized notification contracts', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  try {
    const { eventLifecycle } = await server.ssrLoadModule('/src/features/events/event-lifecycle.ts')
    const event = { status: 'scheduled', startsAt: '2030-01-01T10:00:00Z', endsAt: '2030-01-01T12:00:00Z' }
    assert.equal(eventLifecycle(event, Date.parse(event.startsAt) - 1), 'Upcoming')
    assert.equal(eventLifecycle(event, Date.parse(event.startsAt)), 'In progress')
    assert.equal(eventLifecycle(event, Date.parse(event.endsAt) - 1), 'In progress')
    assert.equal(eventLifecycle(event, Date.parse(event.endsAt)), 'Finished')
    assert.equal(eventLifecycle({ ...event, status: 'cancelled' }, Date.parse(event.endsAt)), 'Cancelled')
    const { notify, notifyFailure, notificationStore } =
      await server.ssrLoadModule('/src/lib/notifications.ts')
    const { HttpError } = await server.ssrLoadModule('/src/lib/http-client.ts')
    notificationStore.clear()
    let changes = 0
    const unsubscribe = notificationStore.subscribe(() => changes++)
    notify('comment.posted')
    notify('comment.posted')
    assert.equal(notificationStore.snapshot().length, 1)
    assert.equal(changes, 1, 'Duplicate delivery does not announce again')
    notify('reply.posted')
    notify('comment.posted')
    assert.equal(changes, 2, 'An already visible notification is not stacked twice')
    notify('review.posted')
    assert.equal(notificationStore.snapshot().length, 2, 'At most two notifications')
    const first = notificationStore.snapshot()[0]
    notificationStore.dismiss(first.id)
    assert.equal(notificationStore.snapshot().length, 1)
    notifyFailure(
      new HttpError(400, 'PRIVATE email@example.test room-code token', { body: ['PRIVATE field'] }),
    )
    const error = notificationStore.snapshot().at(-1)
    assert.equal(error.variant, 'error')
    assert.match(error.description, /highlighted fields/)
    assert.equal(JSON.stringify(error).includes('PRIVATE'), false)
    assert.equal(JSON.stringify(error).includes('email@example.test'), false)
    notify('cover.partial', 'warning')
    assert.equal(notificationStore.snapshot().at(-1).variant, 'warning')
    notify('report.existing', 'info')
    assert.equal(notificationStore.snapshot().at(-1).variant, 'info')
    notificationStore.clear()
    assert.deepEqual(notificationStore.snapshot(), [])
    unsubscribe()
  } finally {
    await server.close()
  }
})
