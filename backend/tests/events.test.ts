import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { createDatabaseClient } from '../src/db/supabase.js'
import { ApiError } from '../src/shared/api-error.js'
import { createEventRepository } from '../src/modules/events/event-repository.js'
import { eventDiscoverySchema } from '../src/modules/events/event-schema.js'
import { encodeEventCursor } from '../src/modules/events/event-pagination.js'
import type {
  EventDiscoveryFilters,
  EventRepository,
  EventSummary,
  HostEventDetails,
  NewEvent,
  PublicEventDetails,
} from '../src/modules/events/types.js'
import { testEnvironment } from './helpers.js'

const hostId = randomUUID()
const otherId = randomUUID()
const eventId = randomUUID()
const startsAt = new Date(Date.now() + 86400000).toISOString()
const endsAt = new Date(Date.now() + 90000000).toISOString()
const summary: EventSummary = {
  id: eventId,
  title: 'A welcoming game night',
  game: { id: 1, name: 'Dungeons & Dragons', category: 'role-playing' },
  city: { id: 1, name: 'Podgorica', administrativeDivision: null },
  country: { id: 1, isoCode: 'ME', name: 'Montenegro' },
  venue: null,
  startsAt,
  endsAt,
  capacity: 4,
  participantCount: 0,
  availableSlots: 4,
  tags: ['Beginner friendly'],
  visibility: 'public',
  status: 'scheduled',
  cover: { kind: 'default', imageUrl: '/images/role-playing.svg' },
}
const publicDetails: PublicEventDetails = {
  ...summary,
  description: 'An introductory fantasy adventure with friendly players.',
  host: { id: hostId, displayName: 'Workshop host' },
  minimumAge: 0,
  experienceLevel: 'all-levels',
  price: 0,
  currency: 'EUR',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  viewer: { userId: null, isHost: false, hasJoined: false },
}
const hostDetails: HostEventDetails = {
  ...publicDetails,
  viewer: { userId: hostId, isHost: true, hasJoined: false },
  address: 'Fictional workshop address',
}
const createInput = {
  title: summary.title,
  description: publicDetails.description,
  gameId: 1,
  cityId: 1,
  address: hostDetails.address,
  startsAt,
  endsAt,
  capacity: 4,
  experienceLevel: 'all-levels',
}

type Call = { operation: string; token: string | undefined; input?: unknown; actor?: string }
function routeApp() {
  const calls: Call[] = []
  const app = buildApp(testEnvironment(), {
    logger: false,
    geography: { listCountries: async () => [], searchCities: async () => [] },
    verifyToken: async (token) => {
      if (token === 'e30.e30.verified') return { id: hostId, email: 'host@example.test' }
      if (token === 'e30.e30.other') return { id: otherId, email: 'other@example.test' }
      throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid test token')
    },
    events: (token) => {
      const note = (operation: string, input?: unknown, actor?: string) =>
        calls.push({ operation, input, actor, token })
      const repository: EventRepository = {
        list: async (filters) => {
          note('list', filters)
          return { items: [summary], pageInfo: { limit: filters.limit, nextCursor: null } }
        },
        get: async (id, actor) => {
          note('get', id, actor)
          return actor === hostId ? hostDetails : publicDetails
        },
        create: async (input, actor) => {
          note('create', input, actor)
          return hostDetails
        },
        update: async (id, patch, actor) => {
          note('update', { id, patch }, actor)
          return hostDetails
        },
        remove: async (id) => {
          note('remove', id)
        },
        join: async (id) => {
          note('join', id)
          return { eventId: id, hasJoined: true, capacity: 4, participantCount: 1, availableSlots: 3 }
        },
        leave: async (id) => {
          note('leave', id)
          return { eventId: id, hasJoined: false, capacity: 4, participantCount: 0, availableSlots: 4 }
        },
      }
      return repository
    },
  })
  return { app, calls }
}

test('event discovery validates bounded filters and preserves cursor precision and literal search', async (t) => {
  const { app, calls } = routeApp()
  t.after(() => app.close())
  const first = await app.inject({
    url: '/api/events',
    headers: { authorization: 'Bearer e30.e30.verified' },
  })
  assert.equal(first.statusCode, 200)
  assert.equal(first.headers['cache-control'], 'no-store')
  assert.deepEqual(first.json().items, [summary])
  assert.deepEqual(calls[0]?.input, {
    upcomingOnly: true,
    availableOnly: false,
    status: 'scheduled',
    limit: 12,
  })
  assert.equal(calls[0]?.token, undefined, 'Discovery must never use host scope.')
  const precise = startsAt.replace(/\.(\d{3})Z$/, (_match, fraction: string) => `.${fraction}456Z`)
  const cursor = encodeEventCursor({ startsAt: precise, id: eventId })
  const query = new URLSearchParams({
    search: '  100%_literal\\table  ',
    country: 'me',
    cityId: '1',
    gameId: '2',
    upcomingOnly: 'false',
    availableOnly: 'true',
    startsAfter: startsAt,
    startsBefore: endsAt,
    limit: '2',
    cursor,
  })
  assert.equal((await app.inject(`/api/events?${query}`)).statusCode, 200)
  const filters = calls.at(-1)?.input as EventDiscoveryFilters
  assert.equal(filters.search, '100%_literal\\table')
  assert.equal(filters.country, 'ME')
  assert.equal(filters.cityId, 1)
  assert.equal(filters.gameId, 2)
  assert.equal(filters.upcomingOnly, false)
  assert.equal(filters.availableOnly, true)
  assert.equal(filters.afterStartsAt, precise)
  assert.equal(filters.afterId, eventId)
  assert.ok(!('cursor' in filters))
  const prior = calls.length
  for (const suffix of [
    'limit=0',
    'limit=51',
    'limit=1&limit=2',
    'country=ME&country=RS',
    'country=MNE',
    'cityId=0',
    'gameId=2147483648',
    'cityId=1.5',
    'availableOnly=yes',
    'upcomingOnly=1',
    'status=cancelled',
    'visibility=private',
    'hostId=1',
    'search=' + 'x'.repeat(101),
    'cursor=not-json',
    'cursor=' + 'x'.repeat(513),
    new URLSearchParams({
      cursor: Buffer.from(JSON.stringify({ startsAt, id: '1' })).toString('base64url'),
    }).toString(),
    new URLSearchParams({
      cursor: Buffer.from(JSON.stringify({ startsAt, id: eventId, actor: hostId })).toString('base64url'),
    }).toString(),
    new URLSearchParams({ startsAfter: endsAt, startsBefore: startsAt }).toString(),
  ])
    assert.equal((await app.inject(`/api/events?${suffix}`)).statusCode, 400, suffix)
  assert.equal(calls.length, prior, 'Malformed filters must not reach data access.')
})

test('event routes require verified UUID actors, allowlist create/patch fields and preserve patch omissions', async (t) => {
  const { app, calls } = routeApp()
  t.after(() => app.close())
  const headers = { authorization: 'Bearer e30.e30.verified' }
  for (const request of [
    { method: 'POST' as const, url: '/api/events', payload: createInput },
    { method: 'PATCH' as const, url: `/api/events/${eventId}`, payload: { title: 'Changed title' } },
    { method: 'DELETE' as const, url: `/api/events/${eventId}` },
  ])
    assert.equal((await app.inject(request)).statusCode, 401)
  for (const override of [
    { title: 'x' },
    { description: 'short' },
    { gameId: '1' },
    { cityId: 0 },
    { venue: 'x' },
    { address: 'x' },
    { capacity: 0 },
    { capacity: 101 },
    { capacity: 1.5 },
    { price: 1.001 },
    { price: -1 },
    { minimumAge: 100 },
    { startsAt: new Date(Date.now() - 1000).toISOString() },
    { endsAt: startsAt },
    { tags: ['Arbitrary tag'] },
    { tags: ['Casual', 'Casual'] },
    { tags: ['Beginner friendly', 'Veterans only'] },
    { tags: ['Veterans only'], experienceLevel: 'beginner' },
    { tags: ['Beginner friendly'], experienceLevel: 'experienced' },
    { coverStoragePath: 'data:image/png;base64,untrusted' },
    { imageUrl: '/images/role-playing.svg' },
    { hostId: otherId },
    { organizerId: 1 },
    { id: eventId },
    { countryId: 1 },
    { participantCount: 1 },
    { attendeeIds: [1] },
    { createdAt: startsAt },
    { role: 'admin' },
  ]) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers,
      payload: { ...createInput, ...override },
    })
    assert.equal(response.statusCode, 400)
  }
  assert.equal(calls.length, 0)
  const created = await app.inject({
    method: 'POST',
    url: '/api/events',
    headers,
    payload: { ...createInput, venue: '  ' },
  })
  assert.equal(created.statusCode, 201)
  assert.equal(created.headers.location, `/api/events/${eventId}`)
  assert.equal(created.json().address, hostDetails.address)
  const received = calls.at(-1)
  assert.equal(received?.actor, hostId)
  assert.equal(received?.token, 'e30.e30.verified')
  const input = received?.input as NewEvent
  assert.equal(input.venue, null)
  assert.equal(input.visibility, 'public')
  assert.equal(input.minimumAge, 0)
  assert.equal(input.price, 0)
  assert.deepEqual(input.tags, [])
  assert.equal(input.coverStoragePath, null)
  const changed = await app.inject({
    method: 'PATCH',
    url: `/api/events/${eventId}`,
    headers,
    payload: { title: '  Another game night  ' },
  })
  assert.equal(changed.statusCode, 200)
  assert.deepEqual(calls.at(-1)?.input, { id: eventId, patch: { title: 'Another game night' } })
  const previous = calls.length
  for (const payload of [
    {},
    { hostId: otherId },
    { country: 'ME' },
    { status: 'deleted' },
    { coverStoragePath: '/covers/fake.png' },
  ]) {
    assert.equal(
      (await app.inject({ method: 'PATCH', url: `/api/events/${eventId}`, headers, payload })).statusCode,
      400,
    )
  }
  assert.equal(calls.length, previous)
  assert.equal(
    (await app.inject({ method: 'DELETE', url: `/api/events/${eventId}`, headers })).statusCode,
    204,
  )
  assert.equal(calls.at(-1)?.token, 'e30.e30.verified')
})

test('event detail routes distinguish anonymous and valid bearer context without accepting browser actors', async (t) => {
  const { app, calls } = routeApp()
  t.after(() => app.close())
  assert.deepEqual((await app.inject(`/api/events/${eventId}`)).json(), publicDetails)
  assert.equal(calls.at(-1)?.token, undefined)
  const own = await app.inject({
    url: `/api/events/${eventId}`,
    headers: { authorization: 'Bearer e30.e30.verified' },
  })
  assert.equal(own.json().address, hostDetails.address)
  assert.equal(own.headers.vary, 'Authorization')
  assert.equal(own.headers['cache-control'], 'no-store')
  assert.equal(calls.at(-1)?.actor, hostId)
  const other = await app.inject({
    url: `/api/events/${eventId}`,
    headers: { authorization: 'Bearer e30.e30.other' },
  })
  assert.ok(!('address' in other.json()))
  const prior = calls.length
  for (const authorization of ['', 'Basic credential', 'Bearer e30.e30.invalid'])
    assert.equal(
      (await app.inject({ url: `/api/events/${eventId}`, headers: { authorization } })).statusCode,
      401,
    )
  assert.equal((await app.inject('/api/events/1')).statusCode, 400)
  assert.equal((await app.inject(`/api/events/${eventId}?hostId=${hostId}`)).statusCode, 400)
  assert.equal(calls.length, prior)
})

test('event adapter isolates caller headers and projects public versus host details independently of upstream fields', async () => {
  const calls: { path: string; body: Record<string, unknown>; authorization: string }[] = []
  let visibility: 'public' | 'private' = 'public'
  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname
    const body: Record<string, unknown> = JSON.parse(String(init?.body))
    calls.push({ path, body, authorization: new Headers(init?.headers).get('Authorization') ?? '' })
    if (path.endsWith('/discover_events'))
      return Response.json({
        items: [{ ...summary, address: hostDetails.address, email: 'private@example.test' }],
        hasMore: true,
      })
    if (path.endsWith('/delete_event')) return Response.json(null)
    return Response.json({
      ...hostDetails,
      visibility,
      viewer:
        path.endsWith('/create_event') || path.endsWith('/update_event')
          ? hostDetails.viewer
          : new Headers(init?.headers).get('Authorization') === 'Bearer first-caller'
            ? hostDetails.viewer
            : { userId: otherId, isHost: false, hasJoined: false },
      email: 'private@example.test',
      birthYear: 1990,
      role: 'admin',
      attendeeIds: [otherId],
    })
  }
  const first = createEventRepository(createDatabaseClient(testEnvironment(), fetcher, 'first-caller'))
  const second = createEventRepository(createDatabaseClient(testEnvironment(), fetcher, 'second-caller'))
  await Promise.all([first.get(eventId, hostId), second.get(eventId, otherId)])
  assert.deepEqual(
    calls
      .slice(0, 2)
      .map((call) => call.authorization)
      .sort(),
    ['Bearer first-caller', 'Bearer second-caller'],
  )
  assert.deepEqual(await second.get(eventId, otherId), {
    ...publicDetails,
    viewer: { userId: otherId, isHost: false, hasJoined: false },
  })
  assert.deepEqual(await first.get(eventId, hostId), hostDetails)
  const filters = eventDiscoverySchema.parse({ limit: '1' })
  const page = await first.list(filters)
  assert.deepEqual(page.items, [summary])
  assert.equal(page.pageInfo.limit, 1)
  assert.equal(page.pageInfo.nextCursor, encodeEventCursor(summary))
  assert.deepEqual(calls.find((call) => call.path.endsWith('/discover_events'))?.body, { p_filters: filters })
  const defaults = {
    ...createInput,
    experienceLevel: 'all-levels' as const,
    venue: null,
    minimumAge: 0,
    price: 0,
    tags: [],
    visibility: 'public' as const,
    coverStoragePath: null,
  }
  await first.create(defaults, hostId)
  await first.update(eventId, { title: 'Changed title' }, hostId)
  await first.remove(eventId)
  assert.deepEqual(calls.find((call) => call.path.endsWith('/create_event'))?.body, { p_input: defaults })
  assert.deepEqual(calls.find((call) => call.path.endsWith('/update_event'))?.body, {
    p_event_id: eventId,
    p_patch: { title: 'Changed title' },
  })
  visibility = 'private'
  for (const actor of [otherId]) {
    await assert.rejects(
      second.get(eventId, actor),
      (error: unknown) =>
        error instanceof ApiError && error.status === 404 && error.message === 'This event does not exist.',
    )
  }
  assert.equal((await first.get(eventId, hostId)).visibility, 'private')
  await assert.rejects(
    first.create(defaults, otherId),
    (error: unknown) => error instanceof ApiError && error.status === 503,
  )
  await assert.rejects(
    first.update(eventId, { title: 'Changed title' }, otherId),
    (error: unknown) => error instanceof ApiError && error.status === 503,
  )
})

test('event adapter rejects unsafe discovery DTOs, invalid availability and oversized upstream pages', async () => {
  const filters = eventDiscoverySchema.parse({ limit: '1' })
  for (const body of [
    { items: [{ ...summary, visibility: 'private' }], hasMore: false },
    { items: [{ ...summary, status: 'cancelled' }], hasMore: false },
    { items: [{ ...summary, availableSlots: 0 }], hasMore: false },
    {
      items: [{ ...summary, cover: { kind: 'upload', imageUrl: 'data:image/png;base64,untrusted' } }],
      hasMore: false,
    },
    { items: [summary, summary], hasMore: true },
    { items: [], hasMore: true },
  ]) {
    const repository = createEventRepository(
      createDatabaseClient(testEnvironment(), async () => Response.json(body)),
    )
    await assert.rejects(
      repository.list(filters),
      (error: unknown) => error instanceof ApiError && error.status === 503,
    )
  }
})

test('event adapter uses consistent sanitized missing/conflict/validation/dependency errors', async () => {
  for (const [body, status, expected] of [
    [{ code: 'P0002', message: 'sensitive location details' }, 400, 404],
    [{ code: 'PT409', message: 'sensitive location details' }, 409, 409],
    [{ code: '23503', message: 'sensitive location details' }, 409, 400],
    [{ code: '23514', message: 'sensitive location details' }, 400, 400],
    [{ code: '42501', message: 'sensitive location details' }, 403, 403],
    [{ code: 'unexpected', message: 'sensitive location details' }, 500, 503],
    [null, 200, 404],
    [{ malformed: true }, 200, 503],
  ] as const) {
    const repository = createEventRepository(
      createDatabaseClient(testEnvironment(), async () => Response.json(body, { status })),
    )
    await assert.rejects(repository.get(eventId), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, expected)
      assert.ok(!error.message.includes('sensitive location'))
      return true
    })
  }
  const unavailable = createEventRepository(
    createDatabaseClient(testEnvironment(), async () => {
      throw new Error('private upstream error')
    }),
  )
  await assert.rejects(
    unavailable.get(eventId),
    (error: unknown) => error instanceof ApiError && error.status === 503,
  )
})
