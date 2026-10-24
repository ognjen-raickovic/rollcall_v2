import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'

const enabled = process.env.RUN_LOCAL_INTEGRATION === 'true'

test(
  'live local Supabase geography and least-privilege API access',
  {
    skip: enabled ? false : 'Set RUN_LOCAL_INTEGRATION=true and configure local backend/.env.',
  },
  async (t) => {
    const env = loadEnvironment()
    const origin = new URL(env.SUPABASE_URL)
    assert.ok(
      ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname),
      'Integration tests require a loopback Supabase URL.',
    )
    const app = buildApp(env, { logger: false })
    t.after(() => app.close())
    const countriesResponse = await app.inject('/api/countries')
    assert.equal(countriesResponse.statusCode, 200, countriesResponse.body)
    const countries: { isoCode: string }[] = countriesResponse.json()
    assert.deepEqual(countries.map((country) => country.isoCode).sort(), ['BA', 'HR', 'ME', 'RS'])
    for (const [country, q, expected] of [
      ['ME', 'pod', 'Podgorica'],
      ['ME', 'Niksic', 'Nikšić'],
      ['RS', 'Cacak', 'Čačak'],
      ['RS', 'ČAČ', 'Čačak'],
      ['BA', 'sar', 'Sarajevo'],
      ['HR', 'zag', 'Zagreb'],
    ]) {
      const response = await app.inject(
        `/api/cities?${new URLSearchParams({ country: country ?? '', q: q ?? '' })}`,
      )
      assert.equal(response.statusCode, 200, response.body)
      const places: { name: string }[] = response.json()
      assert.equal(places[0]?.name, expected)
    }
    for (const suffix of ['country=ZZ', 'country=ME&q=NoSuchPlace', 'country=ME&q=%25', 'country=ME&q=_']) {
      const response = await app.inject(`/api/cities?${suffix}`)
      assert.equal(response.statusCode, 200)
      assert.deepEqual(response.json(), [])
    }
    assert.equal((await app.inject('/api/cities?country=ME&limit=2')).json().length, 2)
    assert.equal((await app.inject('/api/cities?country=ME&limit=21')).statusCode, 400)
    const headers = {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      ...(env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')
        ? {}
        : {
            Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
          }),
    }
    const allowed = await fetch(`${env.SUPABASE_URL}/rest/v1/countries?select=id`, {
      headers,
      signal: AbortSignal.timeout(5000),
    })
    assert.equal(
      allowed.status,
      200,
      'The same credentials must successfully reach the Data API before testing denial.',
    )
    const denied = await fetch(`${env.SUPABASE_URL}/rest/v1/events?select=*`, {
      headers,
      signal: AbortSignal.timeout(5000),
    })
    assert.ok([401, 403].includes(denied.status), 'Anon must not read event records directly.')
  },
)
