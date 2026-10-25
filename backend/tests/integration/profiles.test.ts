import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import type { LightMyRequestResponse } from 'fastify'
import { buildApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createDatabaseClient } from '../../src/db/supabase.js'
import { validateLocalDatabaseUrl } from '../../scripts/geography/store.js'
import type { OwnProfile, PublicProfile } from '../../src/modules/profiles/types.js'

test(
  'local profiles persist with private age, per-game experience and direct Data API owner restrictions',
  {
    skip:
      process.env.RUN_LOCAL_INTEGRATION === 'true'
        ? false
        : 'Requires local Supabase and RUN_LOCAL_INTEGRATION=true.',
    timeout: 90000,
  },
  async (t) => {
    const env = loadEnvironment()
    assert.ok(
      ['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.SUPABASE_URL).hostname),
      'Only loopback Supabase is allowed.',
    )
    const db = new pg.Client({
      connectionString: validateLocalDatabaseUrl(process.env.GEOGRAPHY_DATABASE_URL),
      connectionTimeoutMillis: 5000,
    })
    await db.connect()
    const emails = [
      `profile-integration-${randomUUID()}@example.test`,
      `profile-integration-${randomUUID()}@example.test`,
    ]
    t.after(async () => {
      await db.query('delete from auth.users where email = any($1::text[])', [emails])
      await db.end()
    })
    const app = buildApp(env, { logger: false })
    t.after(() => app.close())
    async function register(email: string) {
      const auth = createDatabaseClient(env).auth
      const registered = await auth.signUp({ email, password: `Rc!${randomUUID()}aA7` })
      assert.equal(registered.error, null, 'Local registration and SMTP must be available.')
      const id = registered.data.user?.id
      assert.ok(id)
      assert.equal(registered.data.session, null, 'Email confirmation stays enabled.')
      const row = await db.query<{ confirmation_token: string }>(
        'select confirmation_token from auth.users where id=$1',
        [id],
      )
      const hash = row.rows[0]?.confirmation_token
      assert.ok(hash)
      const verified = await auth.verifyOtp({ token_hash: hash, type: 'signup' })
      assert.equal(verified.error, null)
      const accessToken = verified.data.session?.access_token
      assert.ok(accessToken)
      return { id, headers: { authorization: `Bearer ${accessToken}` }, accessToken }
    }
    const first = await register(emails[0] ?? '')
    const second = await register(emails[1] ?? '')
    const mine = await app.inject({ url: '/api/me/profile', headers: first.headers })
    assert.equal(mine.statusCode, 200, mine.body)
    assert.equal(mine.json<OwnProfile>().id, first.id)
    assert.equal(mine.json<OwnProfile>().displayName, 'RollCall player')
    assert.equal(mine.json<OwnProfile>().birthYear, null)
    assert.equal(mine.headers['cache-control'], 'no-store')
    assert.equal(
      (await app.inject({ method: 'PATCH', url: '/api/me/profile', payload: { displayName: 'Denied' } }))
        .statusCode,
      401,
    )
    const catalog = (await app.inject('/api/games')).json<{ id: number; name: string }[]>()
    const game = catalog.find((entry) => entry.name === 'Dungeons & Dragons')
    assert.ok(game)
    const countries = (await app.inject('/api/countries')).json<{ id: number; isoCode: string }[]>()
    const montenegro = countries.find((entry) => entry.isoCode === 'ME')
    const serbia = countries.find((entry) => entry.isoCode === 'RS')
    assert.ok(montenegro && serbia)
    const city = (await app.inject('/api/cities?country=ME&q=Podgorica')).json<{ id: number }[]>()[0]
    assert.ok(city)
    const saved = await app.inject({
      method: 'PATCH',
      url: '/api/me/profile',
      headers: first.headers,
      payload: {
        displayName: 'Persistent player',
        biography: 'Friendly cooperative and role-playing games.',
        countryId: montenegro.id,
        cityId: city.id,
        birthYear: 1995,
      },
    })
    assert.equal(saved.statusCode, 200, saved.body)
    const profile = saved.json<OwnProfile>()
    assert.equal(profile.birthYear, 1995)
    assert.equal(profile.country?.isoCode, 'ME')
    assert.equal(profile.city?.id, city.id)
    assert.ok(profile.ageDeclaredAt)
    assert.equal(profile.createdAt, mine.json<OwnProfile>().createdAt)
    const newProcessView = buildApp(env, { logger: false })
    t.after(() => newProcessView.close())
    assert.equal(
      (await newProcessView.inject({ url: '/api/me/profile', headers: first.headers })).json<OwnProfile>()
        .displayName,
      'Persistent player',
    )
    const publicResponse = await app.inject(`/api/users/${first.id}`)
    assert.equal(publicResponse.statusCode, 200)
    const safe = publicResponse.json<PublicProfile>()
    for (const field of ['birthYear', 'ageDeclaredAt', 'email', 'role', 'userMetadata'])
      assert.ok(!(field in safe))
    assert.ok(!publicResponse.body.includes(emails[0] ?? 'unexpected'))
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/me/profile',
          headers: first.headers,
          payload: { id: second.id, displayName: 'Takeover' },
        })
      ).statusCode,
      400,
    )
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/me/profile',
          headers: first.headers,
          payload: { role: 'superadmin' },
        })
      ).statusCode,
      400,
    )
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/users/${second.id}`,
          headers: first.headers,
          payload: { displayName: 'Takeover' },
        })
      ).statusCode,
      404,
    )
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/me/profile',
          headers: first.headers,
          payload: { countryId: serbia.id, cityId: city.id },
        })
      ).statusCode,
      400,
    )
    assert.equal(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/me/profile',
          headers: first.headers,
          payload: { displayName: 'Should not persist', birthYear: 3000 },
        })
      ).statusCode,
      400,
    )
    assert.equal(
      (await app.inject({ url: '/api/me/profile', headers: first.headers })).json<OwnProfile>().displayName,
      'Persistent player',
    )
    assert.equal(
      (await app.inject({ url: '/api/me/profile', headers: second.headers })).json<OwnProfile>().birthYear,
      null,
    )
    for (const level of ['veteran', 'beginner']) {
      const response: LightMyRequestResponse = await app.inject({
        method: 'PUT',
        url: `/api/me/game-experience/${game.id}`,
        headers: first.headers,
        payload: { experience: level },
      })
      assert.equal(response.statusCode, 200, response.body)
      assert.equal(response.json().experience, level)
    }
    const experience = (await app.inject({ url: '/api/me/game-experience', headers: first.headers })).json<
      unknown[]
    >()
    assert.equal(experience.length, 1)
    assert.equal(
      (await app.inject(`/api/users/${first.id}`)).json<PublicProfile>().gameExperience[0]?.experience,
      'beginner',
    )
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/me/game-experience/2147483647',
          headers: first.headers,
          payload: { experience: 'beginner' },
        })
      ).statusCode,
      404,
    )

    async function dataApi(path: string, actor: typeof first | null, options: RequestInit = {}) {
      return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
          ...(actor ? { Authorization: `Bearer ${actor.accessToken}` } : {}),
          ...options.headers,
        },
        signal: AbortSignal.timeout(5000),
      })
    }
    const directPublic = await dataApi(`profiles?id=eq.${first.id}&select=*`, null)
    assert.equal(directPublic.status, 200)
    const directRows = (await directPublic.json()) as Record<string, unknown>[]
    assert.equal(directRows.length, 1)
    for (const field of ['birth_year', 'email', 'role']) assert.ok(!(field in (directRows[0] ?? {})))
    const crossUpdate = await dataApi(`profiles?id=eq.${second.id}`, first, {
      method: 'PATCH',
      body: JSON.stringify({ display_name: 'Takeover' }),
      headers: { Prefer: 'return=representation' },
    })
    assert.equal(crossUpdate.status, 200)
    assert.deepEqual(await crossUpdate.json(), [])
    assert.equal(
      (await app.inject(`/api/users/${second.id}`)).json<PublicProfile>().displayName,
      'RollCall player',
    )
    for (const body of [{ id: second.id }, { created_at: '2026-01-01' }, { updated_at: '2026-01-01' }]) {
      const response = await dataApi(`profiles?id=eq.${first.id}`, first, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      assert.ok(
        [400, 403].includes(response.status),
        'Immutable columns cannot be modified through the Data API.',
      )
    }
    const mismatched = await dataApi(`profiles?id=eq.${first.id}`, first, {
      method: 'PATCH',
      body: JSON.stringify({ country_id: serbia.id, city_id: city.id }),
    })
    assert.equal(mismatched.status, 409)
    for (const table of ['profile_private', 'account_roles', 'event_locations']) {
      const response = await dataApi(`${table}?select=*`, first, { headers: { 'Accept-Profile': 'private' } })
      assert.ok([401, 403, 406].includes(response.status), 'Private schema is not a Data API surface.')
    }
    assert.ok(
      [401, 403].includes((await dataApi('rpc/get_my_profile', null, { method: 'POST', body: '{}' })).status),
    )
    assert.equal(
      (
        await dataApi('rpc/update_my_profile', first, {
          method: 'POST',
          body: JSON.stringify({ p_patch: { role: 'superadmin' } }),
        })
      ).status,
      400,
    )
    const crossGameInsert = await dataApi('user_game_experience', first, {
      method: 'POST',
      body: JSON.stringify({ profile_id: second.id, game_id: game.id, experience_level: 'veteran' }),
    })
    assert.equal(crossGameInsert.status, 403)
    const crossGameUpdate = await dataApi(`user_game_experience?profile_id=eq.${first.id}`, second, {
      method: 'PATCH',
      body: JSON.stringify({ experience_level: 'intermediate' }),
      headers: { Prefer: 'return=representation' },
    })
    assert.equal(crossGameUpdate.status, 200)
    assert.deepEqual(await crossGameUpdate.json(), [])
    const crossGameDelete = await dataApi(`user_game_experience?profile_id=eq.${first.id}`, second, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    })
    assert.equal(crossGameDelete.status, 200)
    assert.deepEqual(await crossGameDelete.json(), [])
    assert.equal(
      (await app.inject({ url: '/api/me/game-experience', headers: first.headers })).json<unknown[]>().length,
      1,
    )
    for (let repeat = 0; repeat < 2; repeat++)
      assert.equal(
        (
          await app.inject({
            method: 'DELETE',
            url: `/api/me/game-experience/${game.id}`,
            headers: first.headers,
          })
        ).statusCode,
        204,
      )
    assert.deepEqual(
      (await app.inject({ url: '/api/me/game-experience', headers: first.headers })).json(),
      [],
    )
    const cleared = await app.inject({
      method: 'PATCH',
      url: '/api/me/profile',
      headers: first.headers,
      payload: { birthYear: null, countryId: null, cityId: null, biography: null },
    })
    assert.equal(cleared.statusCode, 200)
    assert.equal(cleared.json<OwnProfile>().ageDeclaredAt, null)
    assert.equal(cleared.json<OwnProfile>().country, null)
  },
)
