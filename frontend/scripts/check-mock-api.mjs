import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// Exercise the actual TypeScript modules through the existing Vite resolver; no extra runner.
test('RollCall mock contracts and event lifecycle', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
  })
  try {
    const { usersApi } = await server.ssrLoadModule('/src/features/users/api/users-api.ts')
    const { gamesApi } = await server.ssrLoadModule('/src/features/games/api/games-api.ts')
    const { eventsApi } = await server.ssrLoadModule('/src/features/events/api/events-api.ts')
    const { mockReferences } = await server.ssrLoadModule('/src/lib/mock-db.ts')
    const host = { userId: 1 }
    const player = { userId: 2 }
    const errorCode = (code) => (error) => error.code === code && Number.isInteger(error.status)
    const day = 24 * 60 * 60 * 1000
    const input = {
      title: 'Contract test table',
      description: 'A friendly table for the contract checks.',
      gameId: 1,
      city: 'Budapest',
      venue: 'Test Table',
      address: '10 Example Street',
      startsAt: new Date(Date.now() + day).toISOString(),
      endsAt: new Date(Date.now() + 2 * day).toISOString(),
      capacity: 1,
      experienceLevel: 'beginner',
      price: 0,
      imageUrl: null,
    }

    await t.test('catalog references, filtering, missing records, and isolated responses', async () => {
      const users = await usersApi.list()
      const games = await gamesApi.list()
      assert.deepEqual(new Set(users.map((user) => user.id)), mockReferences.userIds)
      assert.deepEqual(new Set(games.map((game) => game.id)), mockReferences.gameIds)
      assert.ok((await usersApi.list({ search: 'MILA', city: 'budapest' })).length > 0)
      assert.ok(
        (await gamesApi.list({ category: 'trading-card' })).every((game) => game.category === 'trading-card'),
      )
      const user = await usersApi.get(1)
      user.displayName = 'Mutated response'
      assert.notEqual((await usersApi.get(1)).displayName, user.displayName)
      await assert.rejects(gamesApi.get(999), errorCode('NOT_FOUND'))
      await assert.rejects(usersApi.get(-1), errorCode('VALIDATION_ERROR'))
      for (const event of await eventsApi.list()) {
        assert.ok(mockReferences.userIds.has(event.organizerId))
        assert.ok(mockReferences.gameIds.has(event.gameId))
        assert.ok(event.attendeeIds.every((id) => mockReferences.userIds.has(id) && id !== event.organizerId))
        assert.equal(new Set(event.attendeeIds).size, event.attendeeIds.length)
        assert.ok(event.attendeeIds.length <= event.capacity)
      }
    })

    await t.test('validation and actor checks leave the store unchanged', async () => {
      const before = await eventsApi.list()
      await assert.rejects(eventsApi.create(input, { userId: null }), errorCode('UNAUTHORIZED'))
      await assert.rejects(eventsApi.create(input, { userId: 999 }), errorCode('UNAUTHORIZED'))
      await assert.rejects(eventsApi.create({ ...input, gameId: 999 }, host), errorCode('VALIDATION_ERROR'))
      await assert.rejects(
        eventsApi.create({ ...input, startsAt: '2020-01-01T00:00:00Z' }, host),
        errorCode('VALIDATION_ERROR'),
      )
      await assert.rejects(
        eventsApi.create({ ...input, endsAt: input.startsAt }, host),
        errorCode('VALIDATION_ERROR'),
      )
      await assert.rejects(
        eventsApi.create({ ...input, organizerId: 2 }, host),
        errorCode('VALIDATION_ERROR'),
      )
      await assert.rejects(eventsApi.create({ ...input, capacity: 0 }, host), errorCode('VALIDATION_ERROR'))
      await assert.rejects(eventsApi.create({ ...input, price: 1.234 }, host), errorCode('VALIDATION_ERROR'))
      await assert.rejects(
        eventsApi.list({ startsAfter: input.endsAt, startsBefore: input.startsAt }),
        errorCode('VALIDATION_ERROR'),
      )
      assert.deepEqual(await eventsApi.list(), before)
    })

    const event = await eventsApi.create(input, host)
    await t.test('CRUD, organizer access, filtering, and clone isolation', async () => {
      assert.equal(event.organizerId, 1)
      assert.deepEqual(event.attendeeIds, [])
      assert.equal(event.status, 'scheduled')
      await assert.rejects(
        eventsApi.update(event.id, { title: 'Another title' }, player),
        errorCode('FORBIDDEN'),
      )
      await assert.rejects(eventsApi.remove(event.id, player), errorCode('FORBIDDEN'))
      await assert.rejects(eventsApi.update(event.id, {}, host), errorCode('VALIDATION_ERROR'))
      await assert.rejects(
        eventsApi.update(event.id, { title: undefined }, host),
        errorCode('VALIDATION_ERROR'),
      )
      const unchangedTitle = await eventsApi.update(event.id, { title: undefined, capacity: 1 }, host)
      assert.equal(unchangedTitle.title, event.title)
      await assert.rejects(
        eventsApi.update(event.id, { attendeeIds: [2] }, host),
        errorCode('VALIDATION_ERROR'),
      )
      const updated = await eventsApi.update(event.id, { title: '  Updated contract table  ' }, host)
      assert.equal(updated.title, 'Updated contract table')
      updated.attendeeIds.push(8)
      assert.deepEqual((await eventsApi.get(event.id)).attendeeIds, [])
      const matches = await eventsApi.list({
        search: 'UPDATED CONTRACT',
        city: 'budapest',
        gameId: 1,
        availableOnly: true,
        startsAfter: input.startsAt,
        startsBefore: input.startsAt,
      })
      assert.ok(matches.some((item) => item.id === event.id))
    })

    await t.test('simultaneous joins, idempotent attendance, and capacity enforcement', async () => {
      await assert.rejects(eventsApi.join(event.id, host), errorCode('CONFLICT'))
      const results = await Promise.allSettled([
        eventsApi.join(event.id, player),
        eventsApi.join(event.id, { userId: 3 }),
      ])
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
      const joined = await eventsApi.get(event.id)
      assert.equal(joined.attendeeIds.length, 1)
      const attendee = { userId: joined.attendeeIds[0] }
      assert.deepEqual(await eventsApi.join(event.id, attendee), joined)
      assert.ok(!(await eventsApi.list({ availableOnly: true })).some((item) => item.id === event.id))
      await eventsApi.update(event.id, { capacity: 2 }, host)
      await eventsApi.join(event.id, { userId: 4 })
      await assert.rejects(eventsApi.update(event.id, { capacity: 1 }, host), errorCode('CONFLICT'))
      const left = await eventsApi.leave(event.id, attendee)
      assert.deepEqual(await eventsApi.leave(event.id, attendee), left)
      await assert.rejects(eventsApi.leave(event.id, host), errorCode('CONFLICT'))
    })

    await t.test('canceled/started attendance rules and removal', async () => {
      await eventsApi.update(event.id, { status: 'cancelled' }, host)
      await assert.rejects(eventsApi.join(event.id, player), errorCode('CONFLICT'))
      await assert.rejects(eventsApi.leave(event.id, player), errorCode('CONFLICT'))
      await eventsApi.update(event.id, { status: 'scheduled' }, host)
      const originalNow = Date.now
      try {
        Date.now = () => Date.parse(input.startsAt) + 1
        await assert.rejects(eventsApi.join(event.id, player), errorCode('CONFLICT'))
        await assert.rejects(eventsApi.leave(event.id, player), errorCode('CONFLICT'))
      } finally {
        Date.now = originalNow
      }
      await eventsApi.remove(event.id, host)
      await assert.rejects(eventsApi.get(event.id), errorCode('NOT_FOUND'))
      await assert.rejects(eventsApi.remove(event.id, host), errorCode('NOT_FOUND'))
    })
  } finally {
    await server.close()
  }
})
