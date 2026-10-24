import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

test('geography HTTP client contracts', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
  })
  const originalFetch = globalThis.fetch
  try {
    const { geographyApi } = await server.ssrLoadModule('/src/features/geography/api/geography-api.ts')
    const { apiOrigin } = await server.ssrLoadModule('/src/features/geography/api/http-client.ts')
    const country = { id: 1, isoCode: 'ME', name: 'Montenegro' }
    const city = {
      id: 42,
      countryId: 1,
      countryIsoCode: 'ME',
      countryName: 'Montenegro',
      name: 'Nikšić',
      administrativeDivision: 'Nikšić',
      admin1Code: '12',
      admin2Code: null,
      latitude: 42,
      longitude: 19,
    }
    await t.test('validates country rows and sends bounded encoded city queries', async () => {
      const calls = []
      globalThis.fetch = async (url, options) => {
        calls.push({ url, options })
        return Response.json(String(url).includes('/cities?') ? [city] : [country])
      }
      assert.deepEqual(await geographyApi.countries(), [country])
      assert.deepEqual(await geographyApi.cities('ME', 'Niksic'), [city])
      const url = new URL(calls[1].url, 'http://localhost')
      assert.equal(url.searchParams.get('country'), 'ME')
      assert.equal(url.searchParams.get('q'), 'Niksic')
      assert.equal(url.searchParams.get('limit'), '4')
      assert.ok(calls[1].options.signal instanceof AbortSignal)
    })
    await t.test('rejects malformed payloads and cross-country results', async () => {
      globalThis.fetch = async () => Response.json([{ ...country, id: 'wrong' }])
      await assert.rejects(geographyApi.countries(), /unexpected data/)
      globalThis.fetch = async () => Response.json([city])
      await assert.rejects(geographyApi.cities('RS', 'Niksic'), /different country/)
      globalThis.fetch = async () => Response.json(Array.from({ length: 5 }, () => city))
      await assert.rejects(geographyApi.cities('ME', ''), /unexpected data/)
    })
    await t.test('sanitizes unavailable services and non-JSON responses', async () => {
      globalThis.fetch = async () => {
        throw new Error('sensitive internal URL')
      }
      await assert.rejects(
        geographyApi.countries(),
        (error) => /unavailable/.test(error.message) && !error.message.includes('sensitive'),
      )
      globalThis.fetch = async () => new Response('not JSON')
      await assert.rejects(geographyApi.countries(), /unexpected response/)
      globalThis.fetch = async () => Response.json({ private: 'not echoed' }, { status: 503 })
      await assert.rejects(geographyApi.countries(), /could not load/)
    })
    await t.test('cancellation reaches the fetch transport', async () => {
      const controller = new AbortController()
      let transport
      globalThis.fetch = async (_url, options) =>
        new Promise((_resolve, reject) => {
          transport = options.signal
          transport.addEventListener('abort', () => reject(transport.reason), { once: true })
        })
      const request = geographyApi.countries(controller.signal)
      controller.abort()
      await assert.rejects(request)
      assert.equal(transport.aborted, true)
    })
    await t.test('only HTTP origins without credentials or paths are accepted', () => {
      assert.equal(apiOrigin(''), '')
      assert.equal(apiOrigin('https://example.com/'), 'https://example.com')
      for (const value of [
        'javascript:alert(1)',
        'https://user:secret@example.com',
        'https://example.com/private',
      ])
        assert.throws(() => apiOrigin(value), /location service address is invalid/)
    })
  } finally {
    globalThis.fetch = originalFetch
    await server.close()
  }
})
