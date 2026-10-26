import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { MutationObserver, QueryClient } from '@tanstack/react-query'

const eventId = '10000000-0000-4000-8000-000000000001'
const hostId = '20000000-0000-4000-8000-000000000001'
const otherId = '20000000-0000-4000-8000-000000000002'
const version = '30000000-0000-4000-8000-000000000001'
const marker = { kind: 'custom', version, imageUrl: '/images/board-games.svg' }
const access = () => ({
  eventId,
  version,
  visibility: 'private',
  imageUrl: `http://127.0.0.1:55321/storage/v1/object/sign/event-covers/${eventId}/${version}.webp?token=synthetic-capability`,
  expiresAt: new Date(Date.now() + 60000).toISOString(),
})
const image = () =>
  new File([Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])], 'cover.webp', {
    type: 'image/webp',
  })
const session = { viewerId: hostId, getAccessToken: async () => 'synthetic-host-token' }
const reply = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

test('persistent event cover client, capability and cache boundaries', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    define: {
      'import.meta.env.VITE_API_ORIGIN': JSON.stringify('http://127.0.0.1:3001'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:55321'),
    },
  })
  const originalFetch = globalThis.fetch
  try {
    const { persistentEventCoversApi: api, preparedCoverFile } = await server.ssrLoadModule(
      '/src/features/events/api/persistent-event-covers-api.ts',
    )
    const { persistentCoverMutationOptions, persistentCoverQueryOptions } = await server.ssrLoadModule(
      '/src/features/events/api/use-persistent-event-covers.ts',
    )

    await t.test(
      'signed reads require the exact event, revision, configured origin and bounded lifetime',
      async () => {
        let requests = 0
        globalThis.fetch = async (url, options) => {
          requests++
          assert.equal(new URL(url).pathname, `/api/events/${eventId}/cover-url`)
          assert.equal(options.headers.Authorization, 'Bearer synthetic-host-token')
          assert.equal(options.cache, 'no-store')
          return reply(access())
        }
        assert.equal((await api.get(eventId, version, session)).version, version)
        assert.equal(requests, 1)
        for (const patch of [
          { eventId: otherId },
          { version: otherId },
          { imageUrl: access().imageUrl.replace('127.0.0.1', 'unrelated.example') },
          { imageUrl: access().imageUrl.replace('/sign/', '/public/') },
          { imageUrl: `${access().imageUrl}&download=original` },
          { expiresAt: new Date(Date.now() - 1000).toISOString() },
          { expiresAt: new Date(Date.now() + 3600000).toISOString() },
        ]) {
          globalThis.fetch = async () => reply({ ...access(), ...patch })
          await assert.rejects(api.get(eventId, version, session))
        }
      },
    )

    await t.test('public reads omit bearer tokens and reject a private capability response', async () => {
      const anonymous = {
        viewerId: null,
        getAccessToken: async () => {
          throw new Error('No Auth call needed for public covers')
        },
      }
      globalThis.fetch = async (_url, options) => {
        assert.equal(options.headers.Authorization, undefined)
        return reply({ ...access(), visibility: 'public' })
      }
      assert.equal((await api.get(eventId, version, anonymous)).visibility, 'public')
      globalThis.fetch = async () => reply(access())
      await assert.rejects(api.get(eventId, version, anonymous))
      globalThis.fetch = async () => reply(null)
      assert.equal(await api.get(eventId, version, anonymous), null)
    })

    await t.test(
      'multipart writes send only the image and verified bearer; normal JSON never receives image data',
      async () => {
        globalThis.fetch = async (url, options) => {
          assert.equal(new URL(url).pathname, `/api/events/${eventId}/cover`)
          assert.equal(options.headers.Authorization, 'Bearer synthetic-host-token')
          assert.equal(options.headers['Content-Type'], undefined)
          assert(options.body instanceof FormData)
          assert.deepEqual([...options.body.keys()], ['file'])
          assert.equal(options.body.get('file').name, 'cover.webp')
          return reply({ eventId, cover: marker, cleanupPending: false })
        }
        assert.equal((await api.upload(eventId, image(), session)).cover.version, version)
        globalThis.fetch = async (_url, options) => {
          assert.equal(options.method, 'DELETE')
          assert.equal(options.body, undefined)
          return reply({
            eventId,
            cover: { kind: 'default', imageUrl: '/images/board-games.svg' },
            cleanupPending: true,
          })
        }
        assert.equal((await api.remove(eventId, session)).cleanupPending, true)
        const prepared = preparedCoverFile(
          `data:image/webp;base64,${Buffer.from(await image().arrayBuffer()).toString('base64')}`,
        )
        assert.equal(prepared.type, 'image/webp')
        assert.equal(prepared.name, 'cover.webp')
        assert.throws(() => preparedCoverFile('data:image/svg+xml;base64,PHN2Zz4='))
      },
    )

    await t.test(
      'invalid identities/files are rejected before transport and server image errors stay sanitized',
      async () => {
        globalThis.fetch = async () => {
          throw new Error('Unexpected transport')
        }
        await assert.rejects(api.upload('1', image(), session))
        await assert.rejects(api.upload(eventId, image(), { ...session, viewerId: null }))
        await assert.rejects(
          api.upload(
            eventId,
            new File(['not-an-image-file'], 'image.svg', { type: 'image/svg+xml' }),
            session,
          ),
        )
        await assert.rejects(
          api.upload(
            eventId,
            new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'cover.png', { type: 'image/png' }),
            session,
          ),
        )
        globalThis.fetch = async () =>
          reply(
            {
              code: 'VALIDATION_ERROR',
              message: 'internal secret',
              fields: { image: ['Choose a valid image.'] },
            },
            400,
          )
        await assert.rejects(api.upload(eventId, image(), session), (error) => {
          assert.equal(error.status, 400)
          assert.deepEqual(error.fields.image, ['Choose a valid image.'])
          assert(!error.message.includes('internal secret'))
          return true
        })
      },
    )

    await t.test(
      'an account switch rejects a late capability rather than accepting private content',
      async () => {
        let switched = false
        const actor = {
          viewerId: hostId,
          getAccessToken: async () => {
            if (switched) throw new Error('Account changed')
            return 'synthetic-host-token'
          },
        }
        globalThis.fetch = async () => {
          switched = true
          return reply(access())
        }
        await assert.rejects(api.get(eventId, version, actor), /Account changed/)
      },
    )

    await t.test(
      'acknowledged cover changes cancel old capabilities and update only their owning details',
      async () => {
        const client = new QueryClient()
        try {
          client.setQueryData(['auth-account'], { id: hostId })
          const detailKey = ['persistent-event-details', eventId, hostId]
          client.setQueryData(detailKey, {
            id: eventId,
            cover: { kind: 'default', imageUrl: '/images/board-games.svg' },
          })
          client.setQueryData(['persistent-event-covers', eventId, hostId, version], access())
          globalThis.fetch = async () => reply({ eventId, cover: marker, cleanupPending: false })
          const mutation = new MutationObserver(client, persistentCoverMutationOptions(client))
          await mutation.mutate({ id: eventId, file: image(), session })
          assert.equal(client.getQueryData(detailKey).cover.version, version)
          assert.equal(client.getQueryData(['persistent-event-covers', eventId, hostId, version]), undefined)
          const options = persistentCoverQueryOptions(eventId, version, session)
          assert.deepEqual(options.queryKey, ['persistent-event-covers', eventId, hostId, version])
          assert.equal(options.gcTime, 0)
        } finally {
          client.clear()
        }
      },
    )

    await t.test(
      'account changes abort a pending cover write and cannot populate the next account cache',
      async () => {
        const client = new QueryClient()
        try {
          client.setQueryData(['auth-account'], { id: hostId })
          let started
          const ready = new Promise((resolve) => {
            started = resolve
          })
          let observedAbort = false
          globalThis.fetch = async (_url, options) => {
            started()
            return new Promise((_resolve, reject) =>
              options.signal.addEventListener(
                'abort',
                () => {
                  observedAbort = true
                  reject(options.signal.reason)
                },
                { once: true },
              ),
            )
          }
          const mutation = new MutationObserver(client, persistentCoverMutationOptions(client))
          const result = mutation.mutate({ id: eventId, file: image(), session }).catch(() => null)
          await ready
          client.setQueryData(['auth-account'], { id: otherId })
          await result
          assert.equal(observedAbort, true)
          assert.equal(client.getQueryData(['persistent-event-details', eventId, otherId]), undefined)
          assert.equal(client.getQueryData(['persistent-event-covers', eventId, otherId, version]), undefined)
        } finally {
          client.clear()
        }
      },
    )
  } finally {
    globalThis.fetch = originalFetch
    await server.close()
  }
})
