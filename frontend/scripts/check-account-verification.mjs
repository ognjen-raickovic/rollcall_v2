import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

test('account verification is bound to its initiating UUID, preserves safe HTTP errors and rejects late switches', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic-account.supabase.co'),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_synthetic_account'),
      'import.meta.env.VITE_API_ORIGIN': JSON.stringify('http://127.0.0.1:3001'),
    },
  })
  const saved = globalThis.fetch
  try {
    const { authClient } = await server.ssrLoadModule('/src/features/users/api/auth-client.ts'),
      { authApi } = await server.ssrLoadModule('/src/features/users/api/auth-api.ts')
    const first = '10000000-0000-4000-8000-000000000001',
      second = '10000000-0000-4000-8000-000000000002'
    let viewer = first,
      calls = 0,
      release
    authClient().auth.getSession = async () => ({
      data: { session: { user: { id: viewer }, access_token: 'synthetic-test' } },
      error: null,
    })
    globalThis.fetch = async () => {
      calls++
      return Response.json({ id: viewer, email: null })
    }
    assert.equal((await authApi.me(first)).id, first)
    viewer = second
    await assert.rejects(authApi.me(first), /account changed/i)
    assert.equal(calls, 1)
    viewer = first
    globalThis.fetch = () => new Promise((resolve) => (release = resolve))
    const pending = authApi.me(first)
    await new Promise((resolve) => setTimeout(resolve, 0))
    viewer = second
    release(Response.json({ id: first, email: null }))
    await assert.rejects(pending, /account changed/i)
    viewer = first
    for (const status of [401, 403, 503]) {
      globalThis.fetch = async () =>
        Response.json({ code: 'PRIVATE', message: 'PRIVATE UPSTREAM DETAIL' }, { status })
      await assert.rejects(
        authApi.me(first),
        (error) => error.status === status && !error.message.includes('PRIVATE'),
      )
    }
    globalThis.fetch = async () => Response.json({ id: second, email: null })
    await assert.rejects(authApi.me(first), /account changed/i)
  } finally {
    globalThis.fetch = saved
    await server.close()
  }
})
