import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { createTokenVerifier } from '../src/modules/auth/token-verifier.js'
import type { AccountIdentity } from '../src/modules/auth/types.js'
import { ApiError } from '../src/shared/api-error.js'
import { testEnvironment } from './helpers.js'

function signingFixture() {
  const env = testEnvironment()
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const kid = randomUUID()
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' }
  const claims = {
    sub: randomUUID(),
    email: 'player@example.test',
    iss: `${env.SUPABASE_URL}/auth/v1`,
    aud: 'authenticated',
    role: 'authenticated',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  function token(overrides: Record<string, unknown> = {}) {
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid })).toString('base64url')
    const body = Buffer.from(JSON.stringify({ ...claims, ...overrides })).toString('base64url')
    const input = `${header}.${body}`
    const signature = sign('sha256', Buffer.from(input), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url')
    return `${input}.${signature}`
  }
  return { env, claims, token, jwk }
}

async function rejectsAuthentication(operation: Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 401)
    assert.equal(error.code, 'UNAUTHENTICATED')
    return true
  })
}

test('asymmetric verification uses trusted JWKS and returns only safe account identity', async () => {
  const fixture = signingFixture()
  const requests: string[] = []
  const verify = createTokenVerifier(fixture.env, async (input) => {
    requests.push(String(input))
    return Response.json({ keys: [fixture.jwk] })
  })
  const identity = await verify(fixture.token({ user_metadata: { role: 'superadmin' } }))
  assert.deepEqual(identity, { id: fixture.claims.sub, email: fixture.claims.email })
  assert.equal(requests.length, 1)
  assert.equal(new URL(requests[0] ?? '').pathname, '/auth/v1/.well-known/jwks.json')
  assert.deepEqual(await verify(fixture.token({ email: undefined })), {
    id: fixture.claims.sub,
    email: null,
  })
  assert.equal(requests.length, 1, 'Published signing keys should be cached by the supported SDK.')
})

test('valid signatures still require the expected issuer, audience, lifetime, UUID and account role', async () => {
  const fixture = signingFixture()
  const verify = createTokenVerifier(fixture.env, async () => Response.json({ keys: [fixture.jwk] }))
  for (const claims of [
    { iss: 'https://other-project.example.test/auth/v1' },
    { aud: 'anon' },
    { aud: ['other'] },
    { exp: Math.floor(Date.now() / 1000) - 1 },
    { exp: undefined },
    { nbf: Math.floor(Date.now() / 1000) + 60 },
    { sub: '1' },
    { role: 'service_role' },
    { role: 'anon' },
    { is_anonymous: true },
  ]) {
    await rejectsAuthentication(verify(fixture.token(claims)))
  }
  assert.equal((await verify(fixture.token({ aud: ['authenticated', 'other'] }))).id, fixture.claims.sub)
})

test('tampered tokens, wrong signing keys, malformed JWTs and unavailable Auth fail closed', async () => {
  const fixture = signingFixture()
  const other = signingFixture()
  const wrongKey = createTokenVerifier(fixture.env, async () =>
    Response.json({ keys: [{ ...other.jwk, kid: fixture.jwk.kid }] }),
  )
  await rejectsAuthentication(wrongKey(fixture.token()))
  const trusted = signingFixture()
  const verify = createTokenVerifier(trusted.env, async () => Response.json({ keys: [trusted.jwk] }))
  const valid = trusted.token()
  assert.equal((await verify(valid)).id, trusted.claims.sub)
  const segments = valid.split('.')
  segments[1] = Buffer.from(JSON.stringify({ ...trusted.claims, sub: randomUUID() })).toString('base64url')
  await rejectsAuthentication(verify(segments.join('.')))
  await rejectsAuthentication(verify('not-a-jwt'))
  const unavailable = createTokenVerifier(fixture.env, async () => {
    throw new Error('private upstream credential must never appear')
  })
  await rejectsAuthentication(unavailable(fixture.token()))
})

test('legacy symmetric verification delegates to Auth rather than decoding unverified claims', async () => {
  const env = testEnvironment()
  const claims = {
    sub: randomUUID(),
    iss: `${env.SUPABASE_URL}/auth/v1`,
    aud: 'authenticated',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const token = `${header}.${body}.dGVzdC1zaWduYXR1cmU`
  let calls = 0
  const verify = createTokenVerifier(env, async (input, init) => {
    calls++
    assert.equal(new URL(String(input)).pathname, '/auth/v1/user')
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${token}`)
    return Response.json({ id: claims.sub, email: null })
  })
  assert.deepEqual(await verify(token), { id: claims.sub, email: null })
  assert.equal(calls, 1)
  const denied = createTokenVerifier(env, async () =>
    Response.json({ message: 'Invalid JWT', error_code: 'bad_jwt' }, { status: 401 }),
  )
  await rejectsAuthentication(denied(token))
})

test('protected API rejects missing/invalid credentials and isolates concurrent account identities', async (t) => {
  const identities: Record<string, AccountIdentity> = {
    'e30.e30.first': { id: randomUUID(), email: 'first@example.test' },
    'e30.e30.second': { id: randomUUID(), email: 'second@example.test' },
  }
  let calls = 0
  const app = buildApp(testEnvironment(), {
    logger: false,
    geography: { listCountries: async () => [], searchCities: async () => [] },
    verifyToken: async (token) => {
      calls++
      const identity = identities[token]
      if (!identity) throw new Error('private upstream detail')
      return identity
    },
  })
  t.after(() => app.close())
  for (const authorization of [undefined, '', 'Basic secret', 'Bearer 1', 'Bearer e30.e30.first extra']) {
    const response = await app.inject({
      url: '/api/me',
      headers: authorization === undefined ? {} : { authorization },
    })
    assert.equal(response.statusCode, 401)
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.equal(response.headers['www-authenticate'], 'Bearer')
    assert.deepEqual(response.json(), {
      code: 'UNAUTHENTICATED',
      message: 'Sign in with a valid account to continue.',
      fields: {},
    })
  }
  assert.equal(calls, 0, 'Malformed credentials must not reach the verifier.')
  const invalid = await app.inject({ url: '/api/me', headers: { authorization: 'Bearer e30.e30.unknown' } })
  assert.equal(invalid.statusCode, 401)
  assert.ok(!invalid.body.includes('private upstream'))
  const responses = await Promise.all(
    Object.entries(identities).map(async ([token, identity]) => {
      const response = await app.inject({
        url: '/api/me?userId=1&role=admin',
        headers: { authorization: `Bearer ${token}` },
      })
      assert.equal(response.statusCode, 200)
      assert.equal(response.headers['cache-control'], 'no-store')
      assert.deepEqual(response.json(), identity)
      return response
    }),
  )
  assert.equal(responses.length, 2)
  assert.equal((await app.inject('/api/me')).statusCode, 401)
  assert.equal((await app.inject('/api/countries')).statusCode, 200)
  assert.equal((await app.inject('/api/cities?country=ME')).statusCode, 200)
})
