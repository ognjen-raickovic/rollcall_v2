import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { buildApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createDatabaseClient } from '../../src/db/supabase.js'
import { signUpFixture } from './registration-fixture.js'

test(
  'atomic profile game drafts persist, conflict safely and enforce Auth, RLS and suspension',
  {
    skip: process.env.RUN_PROFILE_EDITOR_INTEGRATION !== 'true',
    timeout: 60000,
  },
  async () => {
    const env = loadEnvironment(),
      url = new URL(process.env.GEOGRAPHY_DATABASE_URL ?? '')
    assert.equal(url.hostname, '127.0.0.1')
    assert.equal(url.port, '60322')
    assert.equal(new URL(env.SUPABASE_URL).port, '60321')
    const db = new pg.Client({ connectionString: url.href }),
      locker = new pg.Client({ connectionString: url.href })
    await db.connect()
    await locker.connect()
    const app = buildApp(env, { logger: false }),
      accounts: { id: string; token: string }[] = []
    const entry = (gameId: number, experience = 'beginner') => ({ gameId, experience })
    try {
      for (let i = 0; i < 2; i++) {
        const client = createDatabaseClient(env),
          email = 'profile-editor-' + randomUUID() + '@example.test',
          password = 'Rc!' + randomUUID() + 'Z7'
        const signed = await signUpFixture(client.auth, db, { email, password })
        assert.equal(signed.error, null)
        assert.ok(signed.data.user)
        // The legacy fixture helper removes age data; restore a DOB-backed disposable
        // account to exercise the registration immutability rule without changing it.
        await db.query(
          "insert into private.profile_private(profile_id,date_of_birth,birth_year,age_declared_at) values($1,'2000-01-01',2000,now())",
          [signed.data.user.id],
        )
        await db.query('update auth.users set email_confirmed_at=now() where id=$1', [
          signed.data.user.id,
        ])
        const login = await client.auth.signInWithPassword({ email, password })
        assert.equal(login.error, null)
        assert.ok(login.data.session)
        accounts.push({ id: signed.data.user.id, token: login.data.session.access_token })
      }
      const owner = accounts[0],
        other = accounts[1]
      assert.ok(owner && other)
      const headers = { authorization: 'Bearer ' + owner.token }
      const put = (games: unknown, expected: unknown, extra = {}) =>
        app.inject({
          method: 'PUT',
          url: '/api/me/game-experience',
          headers,
          payload: { games, expected, ...extra },
        })
      assert.equal(
        (
          await app.inject({
            method: 'PUT',
            url: '/api/me/game-experience',
            payload: { games: [], expected: [] },
          })
        ).statusCode,
        401,
      )
      for (const payload of [
        { games: [entry(1), entry(1)], expected: [] },
        { games: [entry(1, 'expert')], expected: [] },
        { games: [entry(1)], expected: [], userId: other.id },
        { games: [], expected: [], role: 'superadmin' },
        { games: Array.from({ length: 51 }, (_, i) => entry(i + 1)), expected: [] },
      ])
        assert.equal(
          (await app.inject({ method: 'PUT', url: '/api/me/game-experience', headers, payload }))
            .statusCode,
          400,
        )
      assert.equal((await put([entry(1), entry(2, 'veteran')], [])).statusCode, 200)
      const state = async () =>
        (await app.inject({ url: '/api/me/game-experience', headers })).json() as {
          gameId: number
          experience: string
        }[]
      assert.equal((await state()).length, 2)
      assert.equal(
        (await put([entry(1), entry(2147483647)], [entry(1), entry(2, 'veteran')])).statusCode,
        400,
      )
      assert.equal((await state()).length, 2, 'invalid set does not partially remove existing games')
      const same = [entry(1), entry(2, 'veteran')]
      assert.equal((await put(same, same)).statusCode, 200)
      const concurrent = await Promise.all([
        put([entry(1, 'intermediate')], same),
        put([entry(2, 'beginner')], same),
      ])
      assert.deepEqual(concurrent.map((r) => r.statusCode).sort(), [200, 409])
      assert.equal((await state()).length, 1, 'concurrent replace cannot merge partially')
      const current = (await state()).map(({ gameId, experience }) => ({ gameId, experience }))
      await locker.query('begin')
      await locker.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: owner.id, role: 'authenticated' }),
      ])
      await locker.query('set local role authenticated')
      await locker.query("select public.set_my_game_experience(3,'veteran')")
      let completed = false
      const waiting = put([], current).then((response) => {
        completed = true
        return response
      })
      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(completed, false, 'legacy writer and replace share the statement lock')
      await locker.query('commit')
      assert.equal((await waiting).statusCode, 409, 'legacy update causes a stale-set conflict')
      const dataHeaders = {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        authorization: 'Bearer ' + other.token,
        'Content-Type': 'application/json',
      }
      assert.equal(
        (
          await fetch(env.SUPABASE_URL + '/rest/v1/user_game_experience', {
            method: 'POST',
            headers: dataHeaders,
            body: JSON.stringify({ profile_id: owner.id, game_id: 4, experience_level: 'beginner' }),
          })
        ).status,
        403,
      )
      assert.equal(
        (
          await fetch(env.SUPABASE_URL + '/rest/v1/user_game_experience?profile_id=eq.' + owner.id, {
            method: 'PATCH',
            headers: dataHeaders,
            body: JSON.stringify({ experience_level: 'beginner' }),
          })
        ).status,
        204,
      )
      assert.ok((await state()).some((game) => game.gameId === 3 && game.experience === 'veteran'))
      const city = (
        await db.query(
          "select city.id,city.country_id from public.cities city join public.countries c on c.id=city.country_id where c.iso_code='ME' order by city.id limit 1",
        )
      ).rows[0]
      assert.ok(city)
      const patch = await app.inject({
        method: 'PATCH',
        url: '/api/me/profile',
        headers,
        payload: {
          displayName: 'Edited player',
          biography: 'A new biography.',
          countryId: city.country_id,
          cityId: city.id,
        },
      })
      assert.equal(patch.statusCode, 200)
      assert.equal(patch.json().displayName, 'Edited player')
      const wrongCountry = (
        await db.query('select id from public.countries where enabled and id<>$1 limit 1', [
          city.country_id,
        ])
      ).rows[0].id
      assert.equal(
        (
          await app.inject({
            method: 'PATCH',
            url: '/api/me/profile',
            headers,
            payload: { countryId: wrongCountry, cityId: city.id },
          })
        ).statusCode,
        400,
      )
      assert.equal(
        (
          await app.inject({
            method: 'PATCH',
            url: '/api/me/profile',
            headers,
            payload: { birthYear: 1990 },
          })
        ).statusCode,
        400,
      )
      const publicProfile = (await app.inject('/api/users/' + owner.id)).json()
      assert.equal(publicProfile.biography, 'A new biography.')
      for (const field of ['email', 'birthYear', 'dateOfBirth', 'ageDeclaredAt', 'role'])
        assert.equal(field in publicProfile, false)
      assert.equal(publicProfile.gameExperience.length, (await state()).length)
      assert.equal(
        (
          await app.inject({
            url: '/api/me/game-experience',
            headers: { authorization: 'Bearer ' + other.token },
          })
        ).json().length,
        0,
      )
      const latest = (await state()).map(({ gameId, experience }) => ({ gameId, experience }))
      assert.equal((await put([], latest)).statusCode, 200)
      assert.equal((await state()).length, 0)
      await db.query(
        "insert into private.account_suspensions(profile_id,status,suspended_at,suspended_by,suspension_reason) values($1,'suspended',now(),$1,'Isolated profile test')",
        [owner.id],
      )
      assert.equal((await put([], [])).statusCode, 403)
      const denied = await createDatabaseClient(env, fetch, owner.token).rpc(
        'replace_my_game_experience',
        { p_games: [], p_expected: [] },
      )
      assert.ok(denied.error)
    } finally {
      await locker.query('rollback')
      await locker.end()
      await db.query('delete from auth.users where id=any($1::uuid[])', [
        accounts.map((account) => account.id),
      ])
      await db.end()
      await app.close()
    }
  },
)
