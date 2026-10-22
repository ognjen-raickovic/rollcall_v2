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
    const { eventFormSchema, eventFormDefaults, localDateTime, isoDateTime } = await server.ssrLoadModule(
      '/src/features/events/api/event-form-values.ts',
    )
    const { sessionApi } = await server.ssrLoadModule('/src/features/users/api/session-api.ts')
    const { safeReturnTo, loginPath } = await server.ssrLoadModule('/src/lib/auth-navigation.ts')
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
      tags: ['Beginner friendly'],
      minimumAge: 16,
      visibility: 'public',
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
        eventsApi.create({ ...input, minimumAge: -1 }, host),
        errorCode('VALIDATION_ERROR'),
      )
      await assert.rejects(
        eventsApi.create({ ...input, tags: ['Casual', 'casual'] }, host),
        errorCode('VALIDATION_ERROR'),
      )
      await assert.rejects(
        eventsApi.create({ ...input, visibility: 'members-only' }, host),
        errorCode('VALIDATION_ERROR'),
      )
      await assert.rejects(
        eventsApi.create({ ...input, imageUrl: '/images/../secret.svg' }, host),
        errorCode('VALIDATION_ERROR'),
      )
      await assert.rejects(
        eventsApi.list({ startsAfter: input.endsAt, startsBefore: input.startsAt }),
        errorCode('VALIDATION_ERROR'),
      )
      assert.deepEqual(await eventsApi.list(), before)
    })

    await t.test('shared form validation and local date/time conversion', async () => {
      const date = new Date(Date.now() + 3 * day)
      date.setUTCHours(12, 30, 0, 0)
      assert.equal(isoDateTime(localDateTime(date.toISOString())), date.toISOString())
      assert.equal(isoDateTime('2028-02-30T12:30'), '')
      assert.equal(isoDateTime(''), '')
      const formValues = {
        ...input,
        startsAt: localDateTime(input.startsAt),
        endsAt: localDateTime(input.endsAt),
        title: '  A welcoming test table  ',
        tags: 'Casual play,  New players',
      }
      const parsed = eventFormSchema.parse(formValues)
      assert.equal(parsed.title, 'A welcoming test table')
      assert.deepEqual(parsed.tags, ['Casual play', 'New players'])
      assert.ok(Date.parse(parsed.startsAt) > Date.now())
      const empty = eventFormSchema.safeParse(eventFormDefaults())
      assert.equal(empty.success, false)
      for (const field of [
        'title',
        'description',
        'gameId',
        'city',
        'venue',
        'address',
        'startsAt',
        'endsAt',
      ]) {
        assert.ok(
          empty.error.issues.some((issue) => issue.path[0] === field),
          `Required ${field} has a validation issue`,
        )
      }
      for (const changes of [
        { tags: 'Same, same' },
        { tags: 'a' },
        { capacity: 0 },
        { minimumAge: -1 },
        { endsAt: formValues.startsAt },
        { startsAt: '2020-01-01T12:30' },
      ]) {
        assert.equal(eventFormSchema.safeParse({ ...formValues, ...changes }).success, false)
      }
    })

    await t.test('private events, host-only editing, and existing participant access', async () => {
      const privateEvent = await eventsApi.create(
        { ...input, title: 'Private test table', visibility: 'private' },
        host,
      )
      assert.ok(!(await eventsApi.list()).some((item) => item.id === privateEvent.id))
      await assert.rejects(eventsApi.get(privateEvent.id), errorCode('UNAUTHORIZED'))
      await assert.rejects(eventsApi.get(privateEvent.id, player), errorCode('FORBIDDEN'))
      await assert.rejects(
        eventsApi.update(privateEvent.id, { title: 'Unauthorized edit' }, player),
        errorCode('FORBIDDEN'),
      )
      await assert.rejects(eventsApi.join(privateEvent.id, player), errorCode('FORBIDDEN'))
      assert.equal((await eventsApi.get(privateEvent.id, host)).title, privateEvent.title)
      await eventsApi.update(privateEvent.id, { visibility: 'public' }, host)
      assert.ok(
        (await eventsApi.list({ search: 'Private test table', availableOnly: true })).some(
          (item) => item.id === privateEvent.id,
        ),
      )
      await eventsApi.join(privateEvent.id, player)
      await eventsApi.update(privateEvent.id, { visibility: 'private' }, host)
      assert.equal((await eventsApi.get(privateEvent.id, player)).attendeeIds.length, 1)
      await eventsApi.leave(privateEvent.id, player)
      await assert.rejects(eventsApi.get(privateEvent.id, player), errorCode('FORBIDDEN'))
      assert.deepEqual((await eventsApi.get(privateEvent.id, host)).attendeeIds, [])
      await eventsApi.remove(privateEvent.id, host)
    })

    const event = await eventsApi.create(input, host)
    await t.test('Montenegro discovery filters, visibility, and historical exclusions', async () => {
      const publicEvents = await eventsApi.list({ upcomingOnly: true })
      assert.ok(publicEvents.length >= 7)
      assert.ok(
        publicEvents.every(
          (item) =>
            item.visibility === 'public' &&
            item.status === 'scheduled' &&
            Date.parse(item.startsAt) > Date.now(),
        ),
      )
      assert.ok(!publicEvents.some((item) => [7, 9, 10].includes(item.id)))
      for (const city of ['Podgorica', 'Niksic', 'Budva', 'Bar', 'Kotor', 'Cetinje', 'Tivat']) {
        const matches = await eventsApi.list({ upcomingOnly: true, city: city.toLowerCase() })
        assert.ok(matches.length > 0, `Upcoming events in ${city}`)
        assert.ok(matches.every((item) => item.city.toLowerCase() === city.toLowerCase()))
      }
      assert.equal(
        (await eventsApi.list({ search: 'COMMANDER NIGHT', city: 'niksic', gameId: 2, upcomingOnly: true }))
          .length,
        1,
      )
      assert.equal(
        (await eventsApi.list({ search: 'COMMANDER NIGHT', availableOnly: true, upcomingOnly: true })).length,
        0,
      )
      assert.equal(
        (await eventsApi.list({ search: 'observatory', upcomingOnly: true })).length,
        0,
        'Search matches title, not description',
      )
      assert.equal((await eventsApi.list({ search: 'No matching title', upcomingOnly: true })).length, 0)
      const hidden = await eventsApi.get(10)
      assert.equal(hidden.visibility, 'unlisted')
      assert.ok(!(await eventsApi.list()).some((item) => item.id === hidden.id))
      assert.ok((await eventsApi.list({ visibility: 'unlisted' })).some((item) => item.id === hidden.id))
      assert.equal((await eventsApi.get(7)).status, 'cancelled')
      await assert.rejects(eventsApi.join(7, player), errorCode('CONFLICT'))
      await assert.rejects(eventsApi.join(9, player), errorCode('CONFLICT'))
      await assert.rejects(eventsApi.join(2, { userId: 8 }), errorCode('CONFLICT'))
      const full = await eventsApi.get(2)
      assert.deepEqual(
        await eventsApi.join(2, { userId: 3 }),
        full,
        'Repeated join stays idempotent even when full',
      )
      const images = new Set(publicEvents.filter((item) => item.id !== event.id).map((item) => item.imageUrl))
      const { stat } = await import('node:fs/promises')
      for (const image of images) {
        assert.ok(image?.startsWith('/images/'))
        assert.ok((await stat(fileURLToPath(new URL(`../public${image}`, import.meta.url)))).isFile())
      }
    })
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

    await t.test('demo session, invalid profiles, storage fallback, and safe return paths', async () => {
      const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
      const storage = new Map()
      Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: {
          getItem: (key) => storage.get(key) ?? null,
          setItem: (key, value) => storage.set(key, value),
          removeItem: (key) => storage.delete(key),
        },
      })
      try {
        assert.equal(await sessionApi.get(), null)
        const user = await sessionApi.login(2)
        assert.equal(user.id, 2)
        assert.equal(storage.get('rollcall.demo-user-id'), '2')
        user.displayName = 'Changed outside the API'
        assert.notEqual((await sessionApi.get()).displayName, user.displayName)
        await assert.rejects(sessionApi.login(999), errorCode('NOT_FOUND'))
        assert.equal((await sessionApi.get()).id, 2)
        storage.set('rollcall.demo-user-id', 'not-a-user')
        assert.equal(await sessionApi.get(), null)
        assert.equal(storage.has('rollcall.demo-user-id'), false)
        await sessionApi.login(3)
        assert.equal(await sessionApi.logout(), null)
        assert.equal(await sessionApi.get(), null)
        assert.equal(storage.has('rollcall.demo-user-id'), false)
        Object.defineProperty(globalThis, 'sessionStorage', {
          configurable: true,
          get: () => {
            throw new Error('Storage blocked')
          },
        })
        assert.equal((await sessionApi.login(4)).id, 4)
        assert.equal((await sessionApi.get()).id, 4)
        await sessionApi.logout()
        assert.equal(await sessionApi.get(), null)
      } finally {
        if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
        else delete globalThis.sessionStorage
      }
      assert.equal(safeReturnTo('/events/1?view=details#seats'), '/events/1?view=details#seats')
      assert.equal(loginPath('/events/new'), '/login?returnTo=%2Fevents%2Fnew')
      for (const value of [
        null,
        'https://example.com',
        '//example.com',
        '/\\example.com',
        '/%2f%2fexample.com',
        '/login',
        '/LOGIN/',
        '/%6cogin',
        '/login?returnTo=/events',
        '/%00bad',
        '/%zz',
      ]) {
        assert.equal(safeReturnTo(value), '/events', `Reject return target ${value}`)
      }
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
