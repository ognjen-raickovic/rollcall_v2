import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

test('date filters use civil-day boundaries across DST; URL filters are validated before requests', async () => {
  const previous = process.env.TZ
  process.env.TZ = 'Europe/Belgrade'
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  try {
    const { localDayBoundary, discoveryFromUrl } = await server.ssrLoadModule(
      '/src/features/events/event-discovery-filters.ts',
    )
    for (const [day, hours] of [
      ['2026-03-29', 23],
      ['2026-10-25', 25],
    ])
      assert.equal(
        (Date.parse(localDayBoundary(day, true)) - Date.parse(localDayBoundary(day))) / 3600000,
        hours,
      )
    assert.equal(localDayBoundary('2026-02-30'), null)
    const result = discoveryFromUrl(
      new URLSearchParams(
        'from=2026-03-29&to=2026-03-29&sort=title-asc&category=board-game&tags=Casual,One-shot&timeFrom=16:00&timeTo=22:00&timeZone=Europe/Belgrade&maxMinimumAge=18',
      ),
    )
    assert.equal(result.error, undefined)
    assert.equal(result.filters.startsBeforeExclusive, true)
    assert.equal(result.filters.startsAfter, '2026-03-28T23:00:00.000Z')
    assert.equal(result.filters.startsBefore, '2026-03-29T22:00:00.000Z')
    assert.deepEqual(result.filters.tags, ['Casual', 'One-shot'])
    for (const query of [
      'from=2026-11-20&to=2026-11-01',
      'timeFrom=22:00&timeTo=16:00',
      'sort=rating-desc',
      'from=2026-02-30',
      'visibility=private',
      'availableOnly=true&availability=full',
      'timeFrom=16:00&timeZone=Not/AZone',
      'search=one&search=two',
    ])
      assert.ok(discoveryFromUrl(new URLSearchParams(query)).error)
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
    await server.close()
  }
})
