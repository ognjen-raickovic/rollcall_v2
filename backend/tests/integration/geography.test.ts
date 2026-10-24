import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import pg from 'pg'
import { validateLocalDatabaseUrl } from '../../scripts/geography/store.js'

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
      ['ME', 'Podgorica', 'Podgorica'],
      ['ME', 'Niksic', 'Nikšić'],
      ['RS', 'Cacak', 'Čačak'],
      ['RS', 'ČAČ', 'Čačak'],
      ['BA', 'Sarajevo', 'Sarajevo'],
      ['HR', 'Zagreb', 'Zagreb'],
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

test(
  'imported places expose country/region metadata and multilingual search through HTTP',
  {
    skip: enabled ? false : 'Requires local integration opt-in and the geography import.',
  },
  async (t) => {
    const client = new pg.Client({
      connectionString: validateLocalDatabaseUrl(process.env.GEOGRAPHY_DATABASE_URL),
    })
    await client.connect()
    try {
      const count = await client.query(
        "select count(*)::int n from public.cities where external_source='geonames'",
      )
      if (count.rows[0].n < 1000) {
        t.skip('Run geography:import to test real populated-place coverage.')
        return
      }
    } finally {
      await client.end()
    }
    const app = buildApp(loadEnvironment(), { logger: false })
    t.after(() => app.close())
    for (const [country, q, name] of [
      ['ME', 'Donji Martinici', 'Donji Martinići'],
      ['RS', 'Prolom', 'Prolom'],
      ['BA', 'Agici', 'Agići'],
      ['HR', 'Rezanci', 'Režanci'],
      ['ME', 'НИКШИЋ', 'Nikšić'],
      ['RS', 'Чачак', 'Čačak'],
      ['ME', 'Titograd', 'Podgorica'],
    ]) {
      const response = await app.inject(
        `/api/cities?${new URLSearchParams({ country: country ?? '', q: q ?? '' })}`,
      )
      assert.equal(response.statusCode, 200, response.body)
      const cities: {
        name: string
        countryIsoCode: string
        countryName: string
        administrativeDivision: string | null
        admin1Code: string | null
      }[] = response.json()
      assert.ok(
        cities.some((city) => city.name === name),
        `${country} ${q}: ${response.body}`,
      )
      assert.ok(cities.every((city) => city.countryIsoCode === country && city.countryName.length > 0))
      assert.ok(cities.length <= 4)
      assert.ok(cities.find((city) => city.name === name)?.administrativeDivision)
    }
    for (const country of ['ME', 'RS', 'BA', 'HR']) {
      const response = await app.inject(`/api/cities?country=${country}`)
      assert.equal(response.statusCode, 200)
      assert.equal(response.json().length, 4)
    }
  },
)
