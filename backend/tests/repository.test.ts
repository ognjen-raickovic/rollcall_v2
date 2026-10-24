import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDatabaseClient } from '../src/db/supabase.js'
import { createGeographyRepository } from '../src/modules/geography/geography-repository.js'
import { testEnvironment } from './helpers.js'

test('real Supabase adapter requests enabled countries and the typed search RPC, and maps safe DTOs', async () => {
  const requests: { url: URL; init: RequestInit | undefined }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    requests.push({ url, init })
    const body = url.pathname.includes('/rpc/')
      ? [
          {
            id: 7,
            country_id: 2,
            name: 'Čačak',
            normalized_name: 'cacak',
            administrative_division: null,
            latitude: null,
            longitude: null,
            population: null,
            external_source_id: 'source-field-not-for-api',
          },
        ]
      : [{ id: 1, iso_code: 'ME', name: 'Montenegro' }]
    return Response.json(body)
  }
  const repository = createGeographyRepository(createDatabaseClient(testEnvironment(), fetcher))
  assert.deepEqual(await repository.listCountries(), [{ id: 1, isoCode: 'ME', name: 'Montenegro' }])
  assert.equal(requests[0]?.url.searchParams.get('enabled'), 'eq.true')
  assert.equal(requests[0]?.url.searchParams.get('select'), 'id,iso_code,name')
  assert.equal(requests[0]?.url.searchParams.get('order'), 'name.asc,id.asc')
  assert.deepEqual(await repository.searchCities({ country: 'RS', q: 'Cacak', limit: 3 }), [
    {
      id: 7,
      countryId: 2,
      name: 'Čačak',
      administrativeDivision: null,
      latitude: null,
      longitude: null,
    },
  ])
  assert.equal(requests[1]?.url.pathname, '/rest/v1/rpc/search_cities')
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    country_code: 'RS',
    search_query: 'Cacak',
    result_limit: 3,
  })
})

test('upstream errors, malformed responses and network failures are sanitized', async () => {
  for (const fetcher of [
    async () => Response.json({ message: 'secret schema information', code: '42501' }, { status: 403 }),
    async () => Response.json([{ id: 'unexpected-id' }]),
    async () => {
      throw new Error('connection error with a secret URL')
    },
  ]) {
    const repository = createGeographyRepository(createDatabaseClient(testEnvironment(), fetcher))
    for (const operation of [
      () => repository.listCountries(),
      () => repository.searchCities({ country: 'ME', q: '', limit: 4 }),
    ])
      await assert.rejects(operation, (error: unknown) => {
        assert.ok(error instanceof Error && 'status' in error)
        assert.equal(error.status, 503)
        assert.ok(!error.message.includes('secret'))
        return true
      })
  }
})

test('database requests have a bounded timeout', async () => {
  let attempts = 0
  const fetcher: typeof fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      attempts++
      init?.signal?.addEventListener('abort', () => reject(new Error('request aborted')), { once: true })
    })
  const repository = createGeographyRepository(
    createDatabaseClient(testEnvironment({ SUPABASE_TIMEOUT_MS: '100' }), fetcher),
  )
  // Keep the event loop alive: AbortSignal.timeout itself is unref'ed in Node.
  const keepAlive = setInterval(() => {}, 1000)
  try {
    await assert.rejects(() => repository.listCountries(), { status: 503 })
    assert.equal(attempts, 1, 'SDK retries must not multiply the configured timeout')
  } finally {
    clearInterval(keepAlive)
  }
})
