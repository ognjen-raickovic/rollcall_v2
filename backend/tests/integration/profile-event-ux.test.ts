import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import { buildApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createDatabaseClient } from '../../src/db/supabase.js'
import { signUpFixture } from './registration-fixture.js'

test(
  'real age admission, case-only correction and concurrent host edits preserve privacy and counts',
  { skip: process.env.RUN_PROFILE_EVENT_UX_INTEGRATION !== 'true', timeout: 60000 },
  async () => {
    const env = loadEnvironment(),
      url = new URL(process.env.GEOGRAPHY_DATABASE_URL ?? '')
    assert.equal(url.hostname, '127.0.0.1')
    assert.equal(url.port, '60322')
    assert.equal(new URL(env.SUPABASE_URL).hostname, '127.0.0.1')
    assert.equal(new URL(env.SUPABASE_URL).port, '60321')
    const db = new pg.Client({ connectionString: url.href }),
      locker = new pg.Client({ connectionString: url.href })
    await db.connect()
    await locker.connect()
    const app = buildApp(env, { logger: false }),
      accounts: { id: string; token: string }[] = []
    const headers = (actor: { token: string }) => ({ authorization: 'Bearer ' + actor.token })
    try {
      for (let i = 0; i < 5; i++) {
        const client = createDatabaseClient(env),
          email = 'event-ux-' + randomUUID() + '@example.test',
          password = 'Rc!' + randomUUID() + 'Z7'
        const signed = await signUpFixture(client.auth, db, { email, password })
        assert.equal(signed.error, null)
        assert.ok(signed.data.user)
        await db.query('update auth.users set email_confirmed_at=now() where id=$1', [
          signed.data.user.id,
        ])
        if (i !== 2)
          await db.query(
            'insert into private.profile_private(profile_id,date_of_birth,birth_year,age_declared_at) values($1,$2::date,extract(year from $2::date)::integer,now())',
            [signed.data.user.id, i === 1 || i === 3 ? '2017-01-01' : '2000-01-01'],
          )
        const login = await client.auth.signInWithPassword({ email, password })
        assert.equal(login.error, null)
        assert.ok(login.data.session)
        accounts.push({ id: signed.data.user.id, token: login.data.session.access_token })
      }
      const host = accounts[0],
        player = accounts[1],
        legacy = accounts[2],
        contender = accounts[3]
      assert.ok(host && player && legacy && contender)
      const own = (await app.inject({ url: '/api/me/profile', headers: headers(player) })).json()
      const spelling = own.username[0].toUpperCase() + own.username.slice(1)
      let response = await app.inject({
        method: 'PATCH',
        url: '/api/me/username-casing',
        headers: headers(player),
        payload: { username: spelling, expected: own.username },
      })
      assert.equal(response.statusCode, 200)
      assert.equal(response.json().username, spelling)
      assert.equal(response.json().id, player.id)
      assert.equal(
        (
          await app.inject({
            method: 'PATCH',
            url: '/api/me/username-casing',
            headers: headers(player),
            payload: { username: 'AnotherHandle', expected: spelling },
          })
        ).statusCode,
        400,
      )
      assert.equal(
        (
          await app.inject({
            method: 'PATCH',
            url: '/api/me/username-casing',
            headers: headers(legacy),
            payload: { username: spelling, expected: own.username },
          })
        ).statusCode,
        400,
      )
      assert.equal(
        (
          await app.inject({
            method: 'PATCH',
            url: '/api/me/username-casing',
            payload: { username: spelling, expected: own.username },
          })
        ).statusCode,
        401,
      )
      const city = (
        await db.query(
          "select city.id from public.cities city join public.countries c on c.id=city.country_id where c.iso_code='ME' order by city.id limit 1",
        )
      ).rows[0].id
      const input = {
        title: 'Atomic age table',
        description: 'A real isolated tabletop age admission test.',
        gameId: 1,
        cityId: city,
        address: 'Synthetic protected address',
        startsAt: '2031-12-31T23:30:00Z',
        endsAt: '2032-01-01T03:00:00Z',
        capacity: 1,
        minimumAge: 15,
        experienceLevel: 'intermediate-plus',
        tags: ['Casual', 'One-shot'],
        visibility: 'public',
      }
      const create = async (payload: object) =>
        app.inject({ method: 'POST', url: '/api/events', headers: headers(host), payload })
      for (const tags of [
        ['Casual', 'Competitive'],
        ['One-shot', 'Campaign'],
      ])
        assert.equal((await create({ ...input, tags })).statusCode, 400)
      assert.equal((await create({ ...input, experienceLevel: 'experienced' })).statusCode, 400)
      response = await create(input)
      assert.equal(response.statusCode, 201)
      const id = response.json().id
      const batch = async (actor: { token: string }, eventIds: string[]) =>
        app.inject({
          method: 'POST',
          url: '/api/events/viewer-status',
          headers: headers(actor),
          payload: { eventIds },
        })
      let state = await batch(host, [id])
      assert.equal(state.statusCode, 200)
      assert.deepEqual(state.json(), {
        userId: host.id,
        items: [{ eventId: id, isHost: true, hasJoined: false }],
      })
      const join = (actor: { token: string }) =>
        app.inject({
          method: 'POST',
          url: '/api/events/' + id + '/attendees/me',
          headers: headers(actor),
          payload: {},
        })
      assert.equal((await join(legacy)).json().code, 'AGE_INFORMATION_REQUIRED')
      for (const tags of [
        ['Casual', 'Competitive'],
        ['One-shot', 'Campaign'],
      ])
        assert.equal(
          (
            await app.inject({
              method: 'PATCH',
              url: '/api/events/' + id,
              headers: headers(host),
              payload: { tags },
            })
          ).statusCode,
          400,
        )
      await locker.query('begin')
      await locker.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: host.id, role: 'authenticated' }),
      ])
      await locker.query('set local role authenticated')
      await locker.query('select public.update_event($1,$2::jsonb)', [
        id,
        JSON.stringify({ minimumAge: 18 }),
      ])
      let finished = false
      const blocked = join(player).then((value) => {
        finished = true
        return value
      })
      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(finished, false)
      await locker.query('commit')
      response = await blocked
      assert.equal(response.statusCode, 403)
      assert.equal(response.json().code, 'AGE_REQUIREMENT_NOT_MET')
      assert.equal(
        (await app.inject({ url: '/api/events/' + id, headers: headers(host) })).json().participantCount,
        0,
      )
      assert.equal(
        (
          await app.inject({
            method: 'PATCH',
            url: '/api/events/' + id,
            headers: headers(host),
            payload: { minimumAge: 15 },
          })
        ).statusCode,
        200,
      )
      await locker.query('begin')
      await locker.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: player.id, role: 'authenticated' }),
      ])
      await locker.query('set local role authenticated')
      await locker.query('select public.join_event($1)', [id])
      finished = false
      const editing = app
        .inject({
          method: 'PATCH',
          url: '/api/events/' + id,
          headers: headers(host),
          payload: { minimumAge: 18, startsAt: '2032-02-01T12:00:00Z', endsAt: '2032-02-01T14:00:00Z' },
        })
        .then((value) => {
          finished = true
          return value
        })
      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(finished, false)
      await locker.query('commit')
      assert.equal((await editing).statusCode, 200)
      assert.equal((await join(player)).statusCode, 200, 'Existing seat remains idempotent after edits')
      assert.deepEqual((await batch(player, [id])).json().items, [
        { eventId: id, isHost: false, hasJoined: true },
      ])
      assert.equal(
        (
          await app.inject({
            method: 'DELETE',
            url: '/api/events/' + id + '/attendees/me',
            headers: headers(player),
          })
        ).statusCode,
        200,
      )
      assert.equal((await join(player)).statusCode, 403, 'A fresh rejoin checks edited requirements')
      assert.deepEqual((await batch(player, [id])).json().items, [
        { eventId: id, isHost: false, hasJoined: false },
      ])
      response = await create({ ...input, title: 'Last eligible seat' })
      assert.equal(response.statusCode, 201)
      const last = response.json().id
      const races = await Promise.all(
        [player, contender].map((actor) =>
          app.inject({
            method: 'POST',
            url: '/api/events/' + last + '/attendees/me',
            headers: headers(actor),
            payload: {},
          }),
        ),
      )
      assert.deepEqual(races.map((value) => value.statusCode).sort(), [200, 409])
      assert.equal(
        (await app.inject({ url: '/api/events/' + last, headers: headers(host) })).json()
          .participantCount,
        1,
      )
      response = await create({
        ...input,
        title: 'Private age table',
        visibility: 'private',
        minimumAge: 18,
        capacity: 4,
      })
      assert.equal(response.statusCode, 201)
      const privateId = response.json().id,
        invitation = await app.inject({
          url: '/api/events/' + privateId + '/invitation',
          headers: headers(host),
        })
      state = await batch(player, [privateId])
      assert.equal(state.statusCode, 200)
      assert.deepEqual(state.json().items, [])
      assert.equal((await batch(host, [privateId])).json().items[0].isHost, true)
      assert.equal(invitation.statusCode, 200)
      const code = invitation.json().code
      response = await app.inject({
        method: 'POST',
        url: '/api/private-events/join',
        headers: headers(player),
        payload: { code },
      })
      assert.equal(response.statusCode, 403)
      assert.equal(response.json().code, 'AGE_REQUIREMENT_NOT_MET')
      assert.equal(
        (
          await db.query('select attempts from private.invitation_attempts where account_id=$1', [
            player.id,
          ])
        ).rows[0].attempts,
        1,
      )
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/api/private-events/join',
            headers: headers(legacy),
            payload: { code },
          })
        ).json().code,
        'AGE_INFORMATION_REQUIRED',
      )
      const publicData = (await app.inject('/api/users/' + player.id)).json()
      for (const field of ['email', 'birthYear', 'dateOfBirth', 'ageDeclaredAt', 'role'])
        assert.equal(field in publicData, false)
      const discovery = (await app.inject('/api/events?period=all&experience=intermediate-plus')).json()
      assert.ok(discovery.items.some((event: { id: string }) => event.id === id))
      for (const event of discovery.items) {
        assert.ok('minimumAge' in event && 'experienceLevel' in event)
        assert.equal('dateOfBirth' in event, false)
        assert.notEqual(event.id, privateId)
      }
    } finally {
      await locker.query('rollback')
      await locker.end()
      await db.query('delete from public.events where host_id=any($1::uuid[])', [
        accounts.map((actor) => actor.id),
      ])
      await db.query('delete from auth.users where id=any($1::uuid[])', [
        accounts.map((actor) => actor.id),
      ])
      await db.end()
      await app.close()
    }
  },
)
