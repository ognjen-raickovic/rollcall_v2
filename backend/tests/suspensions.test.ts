import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { testEnvironment } from './helpers.js'
import { suspendedError } from '../src/modules/auth/account-status.js'
test('central status denial stays 403 while identity/status recovery paths remain available', async () => {
  const app = buildApp(testEnvironment(), {
    logger: false,
    verifyToken: async () => ({ id: '10000000-0000-4000-8000-000000000001', email: null }),
    assertActiveAccount: async () => {
      throw suspendedError()
    },
  })
  try {
    const headers = { authorization: 'Bearer e30.e30.verified' }
    for (const [method, url] of [
      ['POST', '/api/events'],
      ['PATCH', '/api/me/profile'],
      ['GET', '/api/me/permissions'],
      ['GET', '/api/admin/event-reports'],
    ] as const) {
      const result = await app.inject({ method, url, headers })
      assert.equal(result.statusCode, 403)
      assert.deepEqual(result.json(), {
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your RollCall application access is suspended.',
        fields: {},
      })
    }
    assert.equal((await app.inject({ method: 'GET', url: '/api/me', headers })).statusCode, 200)
  } finally {
    await app.close()
  }
})
