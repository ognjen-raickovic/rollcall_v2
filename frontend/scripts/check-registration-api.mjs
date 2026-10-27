import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

test('Auth errors and registration transport preserve privacy and identify the invalid-key gateway response', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic-registration.supabase.co'),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_synthetic_fixture'),
      'import.meta.env.VITE_API_ORIGIN': JSON.stringify('http://127.0.0.1:3001'),
    },
  })
  const originalFetch = globalThis.fetch,
    originalWindow = globalThis.window
  try {
    globalThis.window = { location: { origin: 'http://localhost:5173' } }
    const { authError } = await server.ssrLoadModule('/src/features/users/api/auth-errors.ts')
    for (const [code, text] of [
      ['email_address_not_authorized', 'team'],
      ['email_not_confirmed', 'Confirm'],
      ['over_email_send_rate_limit', 'emails'],
      ['signup_disabled', 'disabled'],
    ])
      assert.ok(authError({ code }).message.includes(text))
    assert.equal(
      authError({ code: 'unknown', message: 'PRIVATE RAW DATABASE DETAIL' }).message.includes('PRIVATE'),
      false,
    )
    const { authClient, authConfigurationError } = await server.ssrLoadModule(
      '/src/features/users/api/auth-client.ts',
    )
    assert.equal(authConfigurationError(), null)
    const { authApi } = await server.ssrLoadModule('/src/features/users/api/auth-api.ts')
    let prepared, signup
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).pathname, '/api/auth/registration-intent')
      prepared = JSON.parse(options.body)
      return Response.json({ token: '10000000-0000-4000-8000-000000000001' })
    }
    authClient().auth.signUp = async (options) => {
      signup = options
      return { data: { user: null, session: null }, error: null }
    }
    await authApi.register({
      username: 'fixture_user',
      email: 'fixture@example.test',
      dateOfBirth: '2000-02-29',
      password: 'Synthetic-password-123!',
    })
    assert.equal(prepared.dateOfBirth, '2000-02-29')
    assert.equal(prepared.password, undefined)
    assert.deepEqual(signup.options.data, {
      rollcall_registration_token: '10000000-0000-4000-8000-000000000001',
    })
    assert.equal(JSON.stringify(signup).includes('2000-02-29'), false)
    assert.equal(signup.options.emailRedirectTo, 'http://localhost:5173/auth/callback')
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'Not displayed' }), {
        status: 401,
        headers: { 'sb-error-code': 'UNAUTHORIZED_INVALID_API_KEY', 'content-type': 'application/json' },
      })
    await assert.rejects(
      authApi.login({ email: 'fixture@example.test', password: 'Synthetic-password-123!' }),
      (error) => error.code === 'UNAUTHORIZED_INVALID_API_KEY' && !error.message.includes('Not displayed'),
    )
  } finally {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
    await server.close()
  }
})
