import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
test('account status clients preserve identity, privacy and suspension error metadata', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    define: { 'import.meta.env.VITE_API_ORIGIN': JSON.stringify('http://127.0.0.1:3001') },
  })
  const originalFetch = globalThis.fetch,
    originalWindow = globalThis.window
  try {
    const { accountStatusApi: api } = await server.ssrLoadModule(
        '/src/features/users/api/account-status-api.ts',
      ),
      { authApi } = await server.ssrLoadModule('/src/features/users/api/auth-api.ts')
    const actor = '10000000-0000-4000-8000-000000000001',
      target = '20000000-0000-4000-8000-000000000002',
      signal = () => new AbortController().signal
    let current = actor
    authApi.accessToken = async (viewer) => {
      if (viewer !== current) throw Error('Account changed')
      return 'synthetic-test-token'
    }
    await t.test('self status strips internal information; changes send only a reason', async () => {
      globalThis.fetch = async () =>
        Response.json({ status: 'suspended', reason: 'Must not be returned', moderatorId: target })
      assert.deepEqual(await api.self(actor, signal()), { status: 'suspended' })
      let method, body, path
      globalThis.fetch = async (url, options) => {
        method = options.method
        body = JSON.parse(options.body)
        path = new URL(url).pathname
        return Response.json({ id: target, status: 'suspended', changed: true })
      }
      await api.change(actor, target, true, '  Safe internal reason.  ', signal())
      assert.equal(method, 'POST')
      assert.equal(path, `/api/admin/users/${target}/suspension`)
      assert.deepEqual(body, { reason: 'Safe internal reason.' })
      await api.change(actor, target, false, 'Safe reinstatement.', signal())
      assert.equal(method, 'DELETE')
    })
    await t.test('late responses cannot populate another account and aborts are preserved', async () => {
      globalThis.fetch = async () => {
        current = target
        return Response.json({ status: 'active' })
      }
      await assert.rejects(api.self(actor, signal()))
      let requested = false
      globalThis.fetch = async () => {
        requested = true
        return Response.json({ status: 'active' })
      }
      await assert.rejects(api.self(actor, signal()))
      assert.equal(requested, false)
      current = actor
      const controller = new AbortController()
      controller.abort()
      await assert.rejects(api.self(actor, controller.signal))
    })
    await t.test(
      'ACCOUNT_SUSPENDED keeps its safe code and attributes notification to the initiating viewer',
      async () => {
        const targetWindow = new EventTarget()
        globalThis.window = targetWindow
        let notified
        targetWindow.addEventListener('rollcall:account-suspended', (event) => {
          notified = event.detail.viewerId
        })
        globalThis.fetch = async () =>
          Response.json(
            { code: 'ACCOUNT_SUSPENDED', message: 'Untrusted private reason', fields: {} },
            { status: 403 },
          )
        await assert.rejects(
          api.lookup(actor, target, signal()),
          (error) =>
            error.status === 403 &&
            error.code === 'ACCOUNT_SUSPENDED' &&
            !error.message.includes('private reason'),
        )
        assert.equal(notified, actor)
      },
    )
  } finally {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
    await server.close()
  }
})
