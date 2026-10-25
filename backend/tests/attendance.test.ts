import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { createDatabaseClient } from '../src/db/supabase.js'
import { createEventRepository } from '../src/modules/events/event-repository.js'
import { ApiError } from '../src/shared/api-error.js'
import { testEnvironment } from './helpers.js'

const eventId = randomUUID()
const hostId = randomUUID()
const playerId = randomUUID()
const attendance = { eventId, hasJoined: true, capacity: 4, participantCount: 1, availableSlots: 3 }
const detail = {
  id: eventId,
  title: 'A welcoming game night',
  game: { id: 1, name: 'Dungeons & Dragons', category: 'role-playing' },
  city: { id: 1, name: 'Podgorica', administrativeDivision: null },
  country: { id: 1, isoCode: 'ME', name: 'Montenegro' },
  venue: null,
  startsAt: '2026-12-01T18:00:00Z',
  endsAt: '2026-12-01T21:00:00Z',
  capacity: 4,
  participantCount: 1,
  availableSlots: 3,
  tags: ['Beginner friendly'],
  visibility: 'public',
  status: 'scheduled',
  cover: { kind: 'default', imageUrl: '/images/role-playing.svg' },
  description: 'An introductory adventure with welcoming tabletop players.',
  host: { id: hostId, displayName: 'Workshop host' },
  minimumAge: 0,
  experienceLevel: 'all-levels',
  price: 0,
  currency: 'EUR',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  viewer: { userId: null, isHost: false, hasJoined: false },
}

function repository(body: unknown, status = 200) {
  return createEventRepository(
    createDatabaseClient(testEnvironment(), async () => Response.json(body, { status })),
  )
}

function statusIs(status: number) {
  return (error: unknown) => error instanceof ApiError && error.status === status
}

test('attendance routes require verified identity and reject submitted actors, query fields and malformed IDs before RPC', async (t) => {
  const calls: { path: string; authorization: string; body: unknown }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname
    calls.push({
      path,
      authorization: new Headers(init?.headers).get('Authorization') ?? '',
      body: JSON.parse(String(init?.body)),
    })
    return Response.json({ ...attendance, hasJoined: path.endsWith('/join_event') })
  }
  const app = buildApp(testEnvironment(), {
    logger: false,
    verifyToken: async (token) => {
      if (token !== 'e30.e30.verified') throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid test token')
      return { id: playerId, email: null }
    },
    events: (token) => createEventRepository(createDatabaseClient(testEnvironment(), fetcher, token)),
  })
  t.after(() => app.close())
  const headers = { authorization: 'Bearer e30.e30.verified' }
  for (const method of ['POST', 'DELETE'] as const) {
    const url = `/api/events/${eventId}/attendees/me`
    assert.equal((await app.inject({ method, url })).statusCode, 401)
    assert.equal(
      (await app.inject({ method, url, headers: { authorization: 'Bearer e30.e30.invalid' } })).statusCode,
      401,
    )
    for (const payload of [
      { userId: hostId },
      { actor: { userId: playerId } },
      { profileId: playerId },
      null,
      [],
      'player',
    ])
      assert.equal(
        (
          await app.inject({
            method,
            url,
            headers: { ...headers, 'content-type': 'application/json' },
            payload: JSON.stringify(payload),
          })
        ).statusCode,
        400,
      )
    assert.equal((await app.inject({ method, url: `${url}?userId=${hostId}`, headers })).statusCode, 400)
    assert.equal((await app.inject({ method, url: '/api/events/1/attendees/me', headers })).statusCode, 400)
  }
  assert.equal(calls.length, 0)
  for (const method of ['POST', 'DELETE'] as const) {
    for (const payload of [undefined, {}]) {
      const response = await app.inject({
        method,
        url: `/api/events/${eventId}/attendees/me`,
        headers,
        payload,
      })
      assert.equal(response.statusCode, 200)
      assert.equal(response.json().hasJoined, method === 'POST')
      assert.equal(response.headers['cache-control'], 'no-store')
      assert.equal(response.headers.vary, 'Authorization')
      assert.deepEqual(calls.at(-1)?.body, { p_event_id: eventId })
      assert.equal(calls.at(-1)?.authorization, headers.authorization)
    }
  }
})

test('attendance RPC responses require the requested event, operation state and consistent bounded counts', async () => {
  for (const body of [
    { ...attendance, eventId: randomUUID() },
    { ...attendance, hasJoined: false },
    { ...attendance, participantCount: 5 },
    { ...attendance, availableSlots: -1 },
    { ...attendance, participantCount: 0, availableSlots: 4 },
    { ...attendance, capacity: 101, availableSlots: 100 },
    { eventId },
  ])
    await assert.rejects(repository(body).join(eventId), statusIs(503))
  await assert.rejects(repository(attendance).leave(eventId), statusIs(503))
  const withPrivateFields = {
    ...attendance,
    address: 'Private address',
    email: 'player@example.test',
    role: 'admin',
    accessToken: 'untrusted',
  }
  assert.deepEqual(await repository(withPrivateFields).join(eventId), attendance)
  const left = { ...attendance, hasJoined: false, participantCount: 0, availableSlots: 4 }
  assert.deepEqual(await repository(left).leave(eventId), left)
})

test('attendance database errors map to consistent sanitized conflicts, not-found and dependency failures', async () => {
  for (const [code, expected] of [
    ['RA001', 409],
    ['RA002', 409],
    ['RA003', 409],
    ['P0002', 404],
    ['42501', 403],
    ['unexpected', 503],
  ] as const) {
    for (const operation of ['join', 'leave'] as const) {
      await assert.rejects(
        repository({ code, message: 'Private account and address data' }, 500)[operation](eventId),
        (error: unknown) => {
          assert.ok(error instanceof ApiError)
          assert.equal(error.status, expected)
          assert.ok(!error.message.includes('Private account'))
          if (expected === 409) assert.equal(error.code, 'CONFLICT')
          return true
        },
      )
    }
  }
  const unavailable = createEventRepository(
    createDatabaseClient(testEnvironment(), async () => {
      throw new Error('Private upstream connection details')
    }),
  )
  await assert.rejects(unavailable.join(eventId), statusIs(503))
  await assert.rejects(unavailable.leave(eventId), statusIs(503))
})

test('viewer-specific detail DTOs validate identity and isolate public, host and participant addresses', async () => {
  const address = 'Fictional private workshop address'
  const exposed = { ...detail, address, email: 'private@example.test', birthYear: 1990, role: 'admin' }
  assert.deepEqual(await repository(exposed).get(eventId), detail)
  const publicPlayer = { ...detail, viewer: { userId: playerId, isHost: false, hasJoined: false } }
  assert.deepEqual(
    await repository({ ...exposed, viewer: publicPlayer.viewer }).get(eventId, playerId),
    publicPlayer,
  )
  const host = {
    ...detail,
    address,
    visibility: 'private',
    viewer: { userId: hostId, isHost: true, hasJoined: false },
  }
  assert.deepEqual(await repository(host).get(eventId, hostId), host)
  const participant = {
    ...detail,
    address,
    visibility: 'private',
    viewer: { userId: playerId, isHost: false, hasJoined: true },
  }
  assert.deepEqual(await repository(participant).get(eventId, playerId), participant)
  await assert.rejects(
    repository({ ...publicPlayer, visibility: 'private' }).get(eventId, playerId),
    statusIs(404),
  )
  for (const malformed of [
    { ...participant, viewer: { ...participant.viewer, userId: hostId } },
    { ...participant, viewer: { ...participant.viewer, isHost: true } },
    { ...participant, participantCount: 0, availableSlots: 4 },
    { ...participant, address: undefined },
    { ...participant, id: randomUUID() },
    { ...participant, viewer: undefined },
  ])
    await assert.rejects(repository(malformed).get(eventId, playerId), statusIs(503))
  await assert.rejects(repository(participant).get(eventId), statusIs(503))
  await assert.rejects(
    repository({ ...host, viewer: { ...host.viewer, hasJoined: true } }).get(eventId, hostId),
    statusIs(503),
  )
})
