import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { createDatabaseClient } from '../src/db/supabase.js'
import { createProfileRepository } from '../src/modules/profiles/profile-repository.js'
import type { OwnProfile, ProfileRepository } from '../src/modules/profiles/types.js'
import { testEnvironment } from './helpers.js'

const userId = randomUUID()
const fixture: OwnProfile = {
  id: userId,
  displayName: 'Profile player',
  biography: null,
  country: null,
  city: null,
  birthYear: 1995,
  ageDeclaredAt: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  gameExperience: [],
}

test('profile routes use verified identity and strictly validate writes before repository access', async (t) => {
  const calls: { operation: string; token?: string }[] = []
  const { birthYear: _birthYear, ageDeclaredAt: _ageDeclaredAt, ...safe } = fixture
  const app = buildApp(testEnvironment(), {
    logger: false,
    geography: { listCountries: async () => [], searchCities: async () => [] },
    verifyToken: async () => ({ id: userId, email: 'private@example.test' }),
    profiles: (token) => {
      const note = (operation: string) => calls.push({ operation, token })
      const repository: ProfileRepository = {
        getOwn: async () => {
          note('getOwn')
          return fixture
        },
        getPublic: async () => {
          note('getPublic')
          return safe
        },
        updateOwn: async (patch) => {
          note('updateOwn')
          return { ...fixture, ...patch, country: fixture.country, city: fixture.city }
        },
        getExperience: async (id) => {
          assert.equal(id, userId)
          note('getExperience')
          return []
        },
        setExperience: async (gameId, experience) => {
          note('setExperience')
          return { gameId, gameName: 'Dungeons & Dragons', experience }
        },
        removeExperience: async () => {
          note('removeExperience')
        },
        listGames: async () => {
          note('listGames')
          return []
        },
      }
      return repository
    },
  })
  t.after(() => app.close())
  const authorization = 'Bearer e30.e30.verified'
  assert.equal((await app.inject('/api/me/profile')).statusCode, 401)
  assert.equal(
    (await app.inject({ method: 'PATCH', url: '/api/me/profile', payload: { displayName: 'Denied' } }))
      .statusCode,
    401,
  )
  assert.equal(calls.length, 0)
  for (const payload of [
    {},
    { id: randomUUID(), displayName: 'Attempted takeover' },
    { role: 'superadmin' },
    { displayName: 'x' },
    { displayName: 'Broken\nname' },
    { biography: 'x'.repeat(501) },
    { birthYear: new Date().getUTCFullYear() + 1 },
    { countryId: -1 },
    { cityId: '1' },
    { createdAt: '2026-01-01T00:00:00Z' },
  ]) {
    assert.equal(
      (await app.inject({ method: 'PATCH', url: '/api/me/profile', headers: { authorization }, payload }))
        .statusCode,
      400,
    )
  }
  assert.equal(calls.length, 0)
  const own = await app.inject({ url: '/api/me/profile', headers: { authorization } })
  assert.equal(own.statusCode, 200)
  assert.equal(own.json().birthYear, 1995)
  assert.equal(own.headers['cache-control'], 'no-store')
  assert.equal(calls[0]?.token, 'e30.e30.verified')
  const changed = await app.inject({
    method: 'PATCH',
    url: '/api/me/profile',
    headers: { authorization },
    payload: { displayName: '  New name  ' },
  })
  assert.equal(changed.json().displayName, 'New name')
  const publicResponse = await app.inject(`/api/users/${userId}`)
  assert.deepEqual(publicResponse.json(), safe)
  assert.equal(calls.find((entry) => entry.operation === 'getPublic')?.token, undefined)
  assert.equal((await app.inject('/api/users/1')).statusCode, 400)
  assert.equal((await app.inject(`/api/users/${userId}?birthYear=true`)).statusCode, 400)
  assert.deepEqual((await app.inject('/api/games')).json(), [])
  assert.deepEqual(
    (await app.inject({ url: '/api/me/game-experience', headers: { authorization } })).json(),
    [],
  )
  for (const gameId of ['0', '-1', 'one', '2147483648', '1.5']) {
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/me/game-experience/${gameId}`,
          headers: { authorization },
          payload: { experience: 'beginner' },
        })
      ).statusCode,
      400,
    )
  }
  for (const payload of [{ experience: 'verified' }, { experience: 'veteran', userId: randomUUID() }]) {
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/me/game-experience/1',
          headers: { authorization },
          payload,
        })
      ).statusCode,
      400,
    )
  }
  const experience = await app.inject({
    method: 'PUT',
    url: '/api/me/game-experience/1',
    headers: { authorization },
    payload: { experience: 'veteran' },
  })
  assert.equal(experience.json().experience, 'veteran')
  assert.equal(
    (await app.inject({ method: 'DELETE', url: '/api/me/game-experience/1', headers: { authorization } }))
      .statusCode,
    204,
  )
})

test('profile adapter uses isolated caller headers and strips private fields from public results', async () => {
  const headers: string[] = []
  const inputs: { path: string; body: unknown }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname
    inputs.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null })
    headers.push(new Headers(init?.headers).get('Authorization') ?? '')
    if (path.endsWith('/get_my_profile') || path.endsWith('/update_my_profile')) return Response.json(fixture)
    if (path.endsWith('/public_profile'))
      return Response.json({ ...fixture, email: 'private@example.test', role: 'superadmin' })
    if (path.endsWith('/set_my_game_experience'))
      return Response.json({ gameId: 1, gameName: 'Dungeons & Dragons', experience: 'veteran' })
    if (path.endsWith('/remove_my_game_experience')) return Response.json(null)
    return Response.json([
      {
        id: 1,
        name: 'Dungeons & Dragons',
        category: 'role-playing',
        description: 'A collaborative tabletop adventure.',
        min_players: 2,
        max_players: 7,
      },
    ])
  }
  const first = createProfileRepository(createDatabaseClient(testEnvironment(), fetcher, 'first-caller'))
  const second = createProfileRepository(createDatabaseClient(testEnvironment(), fetcher, 'second-caller'))
  await Promise.all([first.getOwn(), second.getOwn()])
  assert.deepEqual(headers.slice(0, 2).sort(), ['Bearer first-caller', 'Bearer second-caller'])
  const safe = await first.getPublic(userId)
  for (const field of ['birthYear', 'ageDeclaredAt', 'email', 'role']) assert.ok(!(field in safe))
  await first.updateOwn({ displayName: 'New name', birthYear: null })
  assert.deepEqual(inputs.find((input) => input.path.endsWith('/update_my_profile'))?.body, {
    p_patch: { displayName: 'New name', birthYear: null },
  })
  assert.deepEqual(await first.getExperience(userId), [])
  assert.equal((await first.setExperience(1, 'veteran')).experience, 'veteran')
  await first.removeExperience(1)
  assert.equal((await first.listGames())[0]?.minPlayers, 2)
})

test('profile adapter sanitizes dependency, validation and missing-record failures', async () => {
  for (const [body, status, expected] of [
    [{ code: 'P0002', message: 'private schema detail' }, 400, 404],
    [{ code: '23514', message: 'private schema detail' }, 400, 400],
    [{ code: '42501', message: 'private schema detail' }, 403, 403],
    [{ code: 'unexpected', message: 'private schema detail' }, 500, 503],
    [null, 200, 404],
    [{ malformed: true }, 200, 503],
  ] as const) {
    const repository = createProfileRepository(
      createDatabaseClient(testEnvironment(), async () => Response.json(body, { status })),
    )
    await assert.rejects(repository.getOwn(), (error: unknown) => {
      assert.ok(error instanceof Error && 'status' in error)
      assert.equal(error.status, expected)
      assert.ok(!error.message.includes('private schema'))
      return true
    })
  }
})
