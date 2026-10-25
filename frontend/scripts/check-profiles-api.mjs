import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

test('profile client account isolation and public projection', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:55321'),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        'sb_publishable_profile-contract-fixture',
      ),
      'import.meta.env.VITE_API_ORIGIN': JSON.stringify('http://127.0.0.1:3001'),
    },
  })
  const originalFetch = globalThis.fetch
  try {
    const { authClient } = await server.ssrLoadModule('/src/features/users/api/auth-client.ts')
    const { profilesApi } = await server.ssrLoadModule('/src/features/users/api/profiles-api.ts')
    const auth = authClient().auth
    const originalGetSession = auth.getSession
    const first = '10000000-0000-4000-8000-000000000001'
    const second = '10000000-0000-4000-8000-000000000002'
    let calls = 0
    globalThis.fetch = async () => {
      calls++
      throw new Error('Unexpected network request')
    }
    try {
      await t.test('an account switch blocks stale owner reads and every write before HTTP', async () => {
        auth.getSession = async () => ({
          data: { session: { user: { id: second }, access_token: 'synthetic-test-token' } },
          error: null,
        })
        for (const operation of [
          () => profilesApi.getOwn(first),
          () => profilesApi.update({ displayName: 'Stale form' }, first),
          () => profilesApi.experience(first),
          () => profilesApi.setExperience({ gameId: 1, experience: 'veteran' }, first),
          () => profilesApi.removeExperience(1, first),
        ])
          await assert.rejects(operation(), /account changed/)
        assert.equal(calls, 0)
      })
      await t.test(
        'own replies must match the expected UUID and public results omit private fields',
        async () => {
          const profile = {
            id: second,
            displayName: 'Public player',
            biography: null,
            country: null,
            city: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            gameExperience: [],
            birthYear: 1990,
            ageDeclaredAt: '2026-01-01T00:00:00Z',
            email: 'private@example.test',
            role: 'admin',
          }
          auth.getSession = async () => ({
            data: { session: { user: { id: first }, access_token: 'synthetic-test-token' } },
            error: null,
          })
          globalThis.fetch = async () => Response.json(profile)
          await assert.rejects(profilesApi.getOwn(first), /could not be verified/)
          await assert.rejects(profilesApi.update({ displayName: 'Player' }, first), /could not be verified/)
          globalThis.fetch = async (_url, options) => {
            assert.equal(new Headers(options.headers).has('Authorization'), false)
            return Response.json(profile)
          }
          const safe = await profilesApi.getPublic(second)
          for (const field of ['birthYear', 'ageDeclaredAt', 'email', 'role'])
            assert.equal(Object.hasOwn(safe, field), false)
        },
      )
    } finally {
      auth.getSession = originalGetSession
    }
  } finally {
    globalThis.fetch = originalFetch
    await server.close()
  }
})
