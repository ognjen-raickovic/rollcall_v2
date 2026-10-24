import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadEnvironment } from '../src/config/env.js'
import { testEnvironment } from './helpers.js'

test('environment defaults and numeric settings are validated', () => {
  const env = testEnvironment()
  assert.equal(env.PORT, 3001)
  assert.equal(env.HOST, '127.0.0.1')
  assert.equal(env.CITY_SEARCH_DEFAULT_LIMIT, 4)
  assert.equal(env.CITY_SEARCH_MAX_LIMIT, 20)
  for (const overrides of [
    { PORT: '0' },
    { PORT: 'x' },
    { SUPABASE_TIMEOUT_MS: '0' },
    { CITY_SEARCH_MAX_LIMIT: '21' },
    { CITY_SEARCH_MAX_LIMIT: '3' },
    { NODE_ENV: 'invalid' },
    { LOG_LEVEL: 'invalid' },
    { SUPABASE_URL: 'file:///tmp/database' },
    { SUPABASE_URL: 'https://user:password@example.com' },
    { SUPABASE_URL: 'https://example.com/rest/v1' },
  ])
    assert.throws(() => testEnvironment(overrides), /Invalid backend configuration:/)
  assert.throws(() => loadEnvironment({}), /SUPABASE_URL/)
})

test('privileged keys are rejected and rejected values are never echoed', () => {
  const token = (role: string) =>
    `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`
  assert.equal(
    testEnvironment({ SUPABASE_PUBLISHABLE_KEY: token('anon') }).SUPABASE_PUBLISHABLE_KEY,
    token('anon'),
  )
  for (const key of ['sb_secret_DO-NOT-ECHO', token('service_role'), token('authenticated'), 'malformed']) {
    assert.throws(
      () => testEnvironment({ SUPABASE_PUBLISHABLE_KEY: key }),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /SUPABASE_PUBLISHABLE_KEY/)
        assert.ok(!error.message.includes(key))
        return true
      },
    )
  }
})
