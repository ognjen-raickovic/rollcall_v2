import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { dependencyUnavailable } from '../src/shared/api-error.js'
import type { CitySearch, GeographyRepository } from '../src/modules/geography/types.js'
import { testEnvironment } from './helpers.js'

const countries = [{ id: 1, isoCode: 'ME', name: 'Montenegro' }]
const cities = [
  {
    id: 1,
    countryId: 1,
    name: 'Podgorica',
    administrativeDivision: null,
    latitude: null,
    longitude: null,
  },
]

test('health is liveness and does not query the database', async (t) => {
  const unavailable: GeographyRepository = {
    listCountries: async () => {
      throw dependencyUnavailable()
    },
    searchCities: async () => {
      throw dependencyUnavailable()
    },
  }
  const app = buildApp(testEnvironment(), { geography: unavailable, logger: false })
  t.after(() => app.close())
  const result = await app.inject('/health')
  assert.equal(result.statusCode, 200)
  assert.deepEqual(result.json(), { status: 'ok', service: 'rollcall-api' })
  const failure = await app.inject('/api/countries')
  assert.equal(failure.statusCode, 503)
  assert.deepEqual(failure.json(), {
    code: 'DEPENDENCY_UNAVAILABLE',
    message: 'Geography data is temporarily unavailable. Try again shortly.',
    fields: {},
  })
})

test('country/city routes return arrays and pass only validated parameters to data access', async (t) => {
  const searches: CitySearch[] = []
  const repository: GeographyRepository = {
    listCountries: async () => countries,
    searchCities: async (input) => {
      searches.push(input)
      return input.country === 'ME' ? cities : []
    },
  }
  const app = buildApp(testEnvironment(), { geography: repository, logger: false })
  t.after(() => app.close())
  assert.deepEqual((await app.inject('/api/countries')).json(), countries)
  const response = await app.inject('/api/cities?country=%20me%20&q=%20Pod%20')
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), cities)
  assert.deepEqual(searches[0], { country: 'ME', q: 'Pod', limit: 4 })
  await app.inject('/api/cities?country=RS&q=%C4%8Ca%C4%8Dak&limit=2')
  assert.deepEqual(searches[1], { country: 'RS', q: 'Čačak', limit: 2 })
  assert.deepEqual((await app.inject('/api/cities?country=ZZ')).json(), [])
  assert.deepEqual(searches[2], { country: 'ZZ', q: '', limit: 4 })
})

test('invalid query parameters are rejected before database access', async (t) => {
  let calls = 0
  const repository: GeographyRepository = {
    listCountries: async () => {
      calls++
      return []
    },
    searchCities: async () => {
      calls++
      return []
    },
  }
  const app = buildApp(testEnvironment(), { geography: repository, logger: false })
  t.after(() => app.close())
  const invalid = [
    '/api/countries?enabled=false',
    '/api/cities',
    '/api/cities?country=',
    '/api/cities?country=MNE',
    '/api/cities?country=12',
    '/api/cities?country=ME&x=1',
    '/api/cities?country=ME&country=RS',
    '/api/cities?country=ME&q=a&q=b',
    '/api/cities?country=ME&limit=0',
    '/api/cities?country=ME&limit=-1',
    '/api/cities?country=ME&limit=2.5',
    '/api/cities?country=ME&limit=21',
    '/api/cities?country=ME&limit=1e1',
    '/api/cities?country=ME&limit=',
    '/api/cities?country=ME&limit=2&limit=3',
    '/api/cities?country=ME&q=a%00b',
    `/api/cities?country=ME&q=${'a'.repeat(81)}`,
  ]
  for (const url of invalid) {
    const response = await app.inject(url)
    assert.equal(response.statusCode, 400, url)
    const body = response.json()
    assert.equal(body.code, 'VALIDATION_ERROR', url)
    assert.ok(Object.keys(body.fields).length > 0, url)
  }
  assert.equal(calls, 0)
})

test('configured result limits, missing routes and unexpected failures use consistent contracts', async (t) => {
  const inputs: CitySearch[] = []
  const app = buildApp(testEnvironment({ CITY_SEARCH_DEFAULT_LIMIT: '2', CITY_SEARCH_MAX_LIMIT: '3' }), {
    logger: false,
    geography: {
      listCountries: async () => {
        throw new Error('private upstream URL and credentials')
      },
      searchCities: async (input) => {
        inputs.push(input)
        return []
      },
    },
  })
  t.after(() => app.close())
  await app.inject('/api/cities?country=HR')
  assert.equal(inputs[0]?.limit, 2)
  assert.equal((await app.inject('/api/cities?country=HR&limit=4')).statusCode, 400)
  const missing = await app.inject('/api/events')
  assert.equal(missing.statusCode, 404)
  assert.equal(missing.json().code, 'NOT_FOUND')
  const failure = await app.inject('/api/countries')
  assert.equal(failure.statusCode, 500)
  assert.equal(failure.json().code, 'INTERNAL_ERROR')
  assert.ok(!failure.body.includes('credentials'))
})
