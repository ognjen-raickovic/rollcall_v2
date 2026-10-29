import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { chromium, expect as baseExpect } from '@playwright/test'
const expect = baseExpect.configure({ timeout: 15000 })

test(
  'discovery previews, authoritative card actions, filters and centered forms',
  { timeout: 300000 },
  async () => {
    const server = await createServer({
      root: fileURLToPath(new URL('..', import.meta.url)),
      cacheDir: fileURLToPath(new URL('../.tmp/discovery-ux-vite', import.meta.url)),
      server: { host: '127.0.0.1', port: 0 },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic-discovery.supabase.co'),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
          'sb_publishable_synthetic_discovery',
        ),
        'import.meta.env.VITE_API_ORIGIN': JSON.stringify(''),
        'import.meta.env.VITE_ENABLE_DEMO_MODE': JSON.stringify('false'),
      },
    })
    await server.listen()
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port
    let browser,
      release = () => {}
    const first = '44000000-0000-4000-8000-000000000001',
      second = '44000000-0000-4000-8000-000000000002',
      host = '44000000-0000-4000-8000-000000000003'
    const id = (n) => '34000000-0000-4000-8000-' + String(n).padStart(12, '0')
    const user = (who) => ({
      id: who,
      email: 'synthetic@example.test',
      aud: 'authenticated',
      role: 'authenticated',
      user_metadata: {},
      app_metadata: {},
      created_at: '2026-10-27T00:00:00Z',
    })
    const session = (who) => ({
      user: user(who),
      access_token: 'synthetic-discovery-token',
      refresh_token: 'synthetic-discovery-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })
    try {
      browser = await chromium.launch({
        headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      })
      await mkdir(fileURLToPath(new URL('../.tmp/discovery-ux', import.meta.url)), { recursive: true })
      for (const theme of process.env.ROLLCALL_TEST_THEME === 'light'
        ? ['light']
        : process.env.ROLLCALL_TEST_THEME === 'dark'
          ? ['dark']
          : ['dark', 'light']) {
        console.log('Checking discovery UX theme:', theme)
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
          page = await context.newPage()
        await context.addInitScript((theme) => localStorage.setItem('rollcall.theme', theme), theme)
        let viewer = null,
          joined = new Set([id(2), id(7), id(8), id(6)]),
          joinCalls = 0,
          detailCalls = 0,
          batchCalls = 0,
          mode = 'normal',
          gate = Promise.resolve()
        const errors = []
        page.on('pageerror', (e) => errors.push(e.message))
        page.on('console', (m) => {
          if (
            m.type() === 'error' &&
            !/Failed to load resource:.*status of (401|403|404|409|503)/.test(m.text())
          )
            errors.push(m.text())
        })
        const games = [
          {
            id: 1,
            name: 'Dungeons & Dragons',
            category: 'role-playing',
            description: 'A tabletop game.',
            minPlayers: 2,
            maxPlayers: 6,
          },
          {
            id: 3,
            name: 'Yu-Gi-Oh!',
            category: 'trading-card',
            description: 'A card game.',
            minPlayers: 2,
            maxPlayers: 6,
          },
        ]
        const rows = Array.from({ length: 9 }, (_, i) => ({
          id: id(i + 1),
          title: 'Table ' + (i + 1),
          game: { id: 1, name: games[0].name, category: 'role-playing' },
          city: { id: 1, name: 'Podgorica', administrativeDivision: null },
          country: { id: 1, isoCode: 'ME', name: 'Montenegro' },
          venue: 'Public game room',
          startsAt: i === 5 ? '2020-01-01T17:00:00Z' : '2032-01-01T17:00:00Z',
          endsAt: i === 5 ? '2020-01-01T20:00:00Z' : '2032-01-01T20:00:00Z',
          capacity: i === 3 ? 1 : 6,
          participantCount: i === 3 || i === 1 || i === 6 || i === 7 || i === 5 ? 1 : 0,
          availableSlots: i === 3 ? 0 : i === 1 || i === 6 || i === 7 || i === 5 ? 5 : 6,
          tags: ['Casual'],
          visibility: i === 6 ? 'private' : i === 8 ? 'unlisted' : 'public',
          status: i === 7 ? 'cancelled' : 'scheduled',
          cover: { kind: 'default', imageUrl: '/images/role-playing.svg' },
          minimumAge: i === 4 ? 18 : 0,
          experienceLevel: 'intermediate-plus',
        }))
        const isHost = (row) => viewer === first && (row.id === id(3) || row.id === id(9))
        const isJoined = (row) => viewer === first && joined.has(row.id)
        await page.route('**/*', async (route) => {
          const request = route.request(),
            url = new URL(request.url()),
            path = url.pathname,
            json = (v, status = 200) =>
              route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) })
          if (path === '/auth/v1/user') return json(user(viewer ?? first))
          if (path === '/api/me') return json({ id: viewer, email: 'synthetic@example.test' })
          if (path === '/api/me/account-status') return json({ status: 'active' })
          if (path === '/api/me/permissions')
            return json({ role: 'user', capabilities: { accessAdmin: false, manageAdminRoles: false } })
          if (path.startsWith('/api/users/'))
            return json({
              id: viewer ?? first,
              username: 'TablePlayer',
              displayName: 'Table Player',
              biography: null,
              country: null,
              city: null,
              createdAt: '2026-10-27T00:00:00Z',
              updatedAt: '2026-10-27T00:00:00Z',
              gameExperience: [],
            })
          if (path === '/api/games') return json(games)
          if (path === '/api/countries') return json([{ id: 1, isoCode: 'ME', name: 'Montenegro' }])
          if (path === '/api/cities') return json([])
          if (path === '/api/events')
            return json({
              items: rows.filter(
                (row) =>
                  row.visibility === 'public' &&
                  row.status === 'scheduled' &&
                  (url.searchParams.get('period') === 'past' ? row.id === id(6) : row.id !== id(6)),
              ),
              pageInfo: { limit: Number(url.searchParams.get('limit') || 12), nextCursor: null },
            })
          if (path === '/api/events/viewer-status') {
            batchCalls++
            assert.ok(viewer)
            const ids = request.postDataJSON().eventIds
            assert.ok(ids.length <= 50)
            return json({
              userId: viewer,
              items: rows
                .filter(
                  (row) =>
                    ids.includes(row.id) &&
                    (row.visibility !== 'private' || isJoined(row) || isHost(row)),
                )
                .map((row) => ({ eventId: row.id, isHost: isHost(row), hasJoined: isJoined(row) })),
            })
          }
          if (path === '/api/me/events')
            return json({
              items: rows.filter((row) =>
                url.searchParams.get('relation') === 'hosting' ? isHost(row) : isJoined(row),
              ),
              pageInfo: { limit: 12, nextCursor: null },
            })
          if (path.endsWith('/attendees/me')) {
            joinCalls++
            await gate
            const row = rows.find((row) => path.includes(row.id))
            assert.ok(row)
            if (mode === 'expired')
              return json({ code: 'UNAUTHENTICATED', message: 'PRIVATE UPSTREAM' }, 401)
            if (row.minimumAge)
              return json({ code: 'AGE_REQUIREMENT_NOT_MET', message: 'PRIVATE UPSTREAM' }, 403)
            if (mode === 'conflict') return json({ code: 'CONFLICT', message: 'PRIVATE UPSTREAM' }, 409)
            if (request.method() === 'DELETE') {
              joined.delete(row.id)
              row.participantCount--
            } else if (!joined.has(row.id)) {
              joined.add(row.id)
              row.participantCount++
            }
            row.availableSlots = row.capacity - row.participantCount
            return json({
              eventId: row.id,
              hasJoined: joined.has(row.id),
              capacity: row.capacity,
              participantCount: row.participantCount,
              availableSlots: row.availableSlots,
            })
          }
          if (path.startsWith('/api/events/')) {
            const row = rows.find((row) => path === '/api/events/' + row.id)
            if (row) {
              detailCalls++
              if (mode === 'missing' || (row.visibility === 'private' && !isJoined(row) && !isHost(row)))
                return json({ code: 'NOT_FOUND', message: 'private' }, 404)
              return json({
                ...row,
                description: 'A friendly local table with a complete public event description.',
                host: { id: isHost(row) ? first : host, displayName: 'Event Host' },
                price: 0,
                currency: 'EUR',
                createdAt: '2026-10-27T00:00:00Z',
                updatedAt: '2026-10-27T00:00:00Z',
                viewer: { userId: viewer, isHost: isHost(row), hasJoined: isJoined(row) },
                ...(isHost(row) || isJoined(row) ? { address: 'PROTECTED ADDRESS' } : {}),
              })
            }
          }
          if (path.startsWith('/api/') || url.hostname.endsWith('.supabase.co')) return route.abort()
          return route.continue()
        })
        const card = (n) =>
          page.locator('article').filter({ has: page.locator('#event-title-' + id(n)) })
        await page.goto(origin + '/events?search=Table')
        try {
          await expect(card(1).getByRole('button', { name: 'Join event', exact: true })).toBeVisible({
            timeout: 10000,
          })
        } catch (error) {
          await page.screenshot({
            path: fileURLToPath(
              new URL('../.tmp/discovery-ux/initial-' + theme + '.png', import.meta.url),
            ),
          })
          console.log('Synthetic initial state', theme, await card(1).textContent(), errors)
          throw error
        }
        assert.equal(detailCalls, 0)
        assert.equal(batchCalls, 0)
        const filters = page.getByRole('search', { name: 'Filter gaming events' }),
          more = filters.getByRole('button', { name: 'More filters', exact: true })
        await more.focus()
        await page.keyboard.press('Enter')
        await expect(more).toHaveAttribute('aria-expanded', 'true')
        await filters.getByLabel('Recommended experience', { exact: true }).selectOption('veteran-plus')
        await more.click()
        await expect(more).toHaveAttribute('aria-expanded', 'false')
        await more.click()
        await expect(filters.getByLabel('Recommended experience', { exact: true })).toHaveValue(
          'veteran-plus',
        )
        const panel = page.locator('[id="' + (await more.getAttribute('aria-controls')) + '"]')
        await expect(panel).toHaveCSS('transition-duration', '0.25s')
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await expect(panel).toHaveCSS('transition-property', 'none')
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await filters.getByRole('button', { name: 'Search', exact: true }).click()
        await expect(page).toHaveURL(/experience=veteran-plus/)
        const filtered = page.url()
        await card(1).getByRole('link', { name: 'Table 1', exact: true }).click({ trial: true })
        await card(1).getByRole('link', { name: 'Table 1', exact: true }).click()
        const preview = page.getByRole('dialog', { name: 'Event preview', exact: true })
        await expect(preview).toBeVisible()
        const scroll = await page.evaluate(() => history.state.usr.eventPreview.scrollY)
        await expect(preview.getByText('Role-Playing Game', { exact: true })).toBeVisible()
        assert.equal((await preview.textContent()).includes('PROTECTED ADDRESS'), false)
        await preview.getByRole('button', { name: 'Join event', exact: true }).click()
        const nestedPrompt = page.getByRole('dialog', { name: 'Join this event', exact: true })
        await expect(nestedPrompt).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(nestedPrompt).toHaveCount(0)
        await expect(preview).toBeVisible()
        await page.keyboard.press('Tab')
        assert.ok(await preview.evaluate((el) => el.contains(document.activeElement)))
        await page.keyboard.press('Escape')
        await expect(preview).toHaveCount(0)
        assert.equal(page.url(), filtered)
        await expect(card(1).getByRole('link', { name: 'Table 1', exact: true })).toBeFocused()
        await expect
          .poll(async () => Math.abs((await page.evaluate(() => scrollY)) - scroll))
          .toBeLessThan(5)
        await page.goForward()
        await expect(preview).toBeVisible()
        await page.mouse.click(2, 2)
        await expect(preview).toHaveCount(0)
        await card(1).getByRole('button', { name: 'Join event', exact: true }).click()
        const prompt = page.getByRole('dialog', { name: 'Join this event', exact: true })
        await expect(prompt).toBeVisible()
        assert.equal(joinCalls, 0)
        await expect(prompt.getByRole('link', { name: 'Log in', exact: true })).toHaveAttribute(
          'href',
          '/login?returnTo=' + encodeURIComponent('/events/' + id(1)),
        )
        const close = prompt.getByRole('button', { name: 'Close authentication prompt' }),
          bounds = await close.boundingBox(),
          dialogBounds = await prompt.boundingBox()
        assert.ok(bounds.x < dialogBounds.x + 30)
        await prompt.getByRole('link', { name: 'Create account', exact: true }).click()
        await expect(page).toHaveURL(/register\?returnTo=/)
        await expect(page.getByRole('link', { name: 'Log in', exact: true }).first()).toHaveAttribute(
          'href',
          '/login?returnTo=' + encodeURIComponent('/events/' + id(1)),
        )
        await page.goto(filtered)
        await card(1).getByRole('link', { name: 'Table 1', exact: true }).click()
        await expect(preview).toBeVisible()
        await page.reload()
        await expect(preview).toHaveCount(0)
        await expect(page.getByRole('heading', { name: 'Table 1', level: 1 })).toBeVisible()
        await page.goto(filtered)
        await card(1).getByRole('link', { name: 'Table 1', exact: true }).click()
        try {
          await expect(preview).toBeVisible()
        } catch (error) {
          console.log(
            'Synthetic preview navigation',
            page.url(),
            await page.evaluate(() => ({
              state: history.state?.usr,
              heading: document.querySelector('h1')?.textContent,
            })),
          )
          throw error
        }
        await preview.getByRole('link', { name: 'Open full event page', exact: true }).click()
        await expect(preview).toHaveCount(0)
        await expect(page).toHaveURL(origin + '/events/' + id(1))
        viewer = first
        await page.evaluate(
          (value) => localStorage.setItem('rollcall.auth', JSON.stringify(value)),
          session(first),
        )
        const detailBefore = detailCalls
        await page.goto(filtered)
        await expect(card(3).getByRole('link', { name: 'Manage event', exact: true })).toBeVisible()
        await expect(card(2).getByRole('button', { name: 'Leave event', exact: true })).toBeVisible()
        await expect(card(4).getByText('Full', { exact: true })).toBeVisible()
        await expect(card(1).getByRole('button', { name: 'Join event', exact: true })).toBeEnabled()
        assert.equal(detailCalls, detailBefore)
        await page.getByRole('button', { name: 'Join private event', exact: true }).click()
        const privateDialog = page.getByRole('dialog', { name: 'Join a private event', exact: true })
        await expect(privateDialog).toBeVisible()
        assert.ok(
          (await privateDialog.getByRole('button', { name: 'Join event', exact: true }).boundingBox())
            .x <
            (await privateDialog.getByRole('button', { name: 'Cancel', exact: true }).boundingBox()).x,
        )
        await privateDialog.getByRole('button', { name: 'Join event', exact: true }).click()
        await expect(privateDialog.getByRole('alert')).toContainText('valid 16-character')
        await privateDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
        await card(2).getByRole('link', { name: 'Table 2', exact: true }).click()
        await expect(preview).toContainText('PROTECTED ADDRESS')
        mode = 'missing'
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
          window.dispatchEvent(new Event('visibilitychange'))
        })
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
          window.dispatchEvent(new Event('visibilitychange'))
        })
        await expect(
          preview.getByRole('heading', { name: 'Event not found', exact: true }),
        ).toBeVisible()
        assert.equal((await preview.textContent()).includes('PROTECTED ADDRESS'), false)
        mode = 'normal'
        await page.getByRole('button', { name: 'Close event preview', exact: true }).click()
        gate = new Promise((resolve) => {
          release = resolve
        })
        await card(1).getByRole('button', { name: 'Join event', exact: true }).click()
        await expect(card(1).getByRole('button', { name: 'Joining...', exact: true })).toBeDisabled()
        assert.equal(await page.getByText('You have joined this event.', { exact: true }).count(), 0)
        release()
        gate = Promise.resolve()
        await expect(card(1).getByRole('button', { name: 'Leave event', exact: true })).toBeVisible()
        await expect(
          page.getByRole('status').filter({ hasText: 'You have joined this event.' }),
        ).toBeVisible()
        await expect(card(1).getByText('1/6 players', { exact: true })).toBeVisible()
        await card(1).getByRole('button', { name: 'Leave event', exact: true }).click()
        await expect(card(1).getByRole('button', { name: 'Join event', exact: true })).toBeVisible()
        await expect(card(1).getByText('0/6 players', { exact: true })).toBeVisible()
        await card(5).getByRole('button', { name: 'Join event', exact: true }).click()
        await expect(card(5).getByRole('alert')).toContainText('at least 18 years old')
        assert.equal((await card(5).textContent()).includes('PRIVATE UPSTREAM'), false)
        mode = 'conflict'
        await card(1).getByRole('button', { name: 'Join event', exact: true }).click()
        await expect(card(1).getByRole('alert')).toBeVisible()
        await expect(card(1).getByText('0/6 players', { exact: true })).toBeVisible()
        mode = 'expired'
        await card(1).getByRole('button', { name: 'Join event', exact: true }).click()
        await expect(card(1).getByRole('button', { name: 'Log in again', exact: true })).toBeVisible()
        mode = 'normal'
        await card(3).getByRole('link', { name: 'Manage event', exact: true }).click()
        await expect(page).toHaveURL(origin + '/events/' + id(3) + '/edit')
        await expect(page.getByRole('heading', { name: 'Edit your event', level: 1 })).toBeVisible()
        assert.equal(await page.getByRole('complementary', { name: 'Hosting tips' }).count(), 0)
        for (const path of ['/events/new', '/events/' + id(3) + '/edit']) {
          await page.goto(origin + path)
          const form = page.getByRole('form', {
            name: path.endsWith('/edit') ? 'Edit event' : 'Create event',
          })
          await expect(form).toBeVisible()
          const box = await form.boundingBox()
          assert.ok(box.width <= 896 && Math.abs(box.x + box.width / 2 - 720) < 3)
          await expect(form.getByLabel(/^Game/)).toContainText('Role-Playing Game')
          for (const name of [
            'Event title',
            'Description',
            'Address',
            'Maximum participants',
            'Minimum age',
          ])
            await expect(form.getByLabel(new RegExp('^' + name))).toBeVisible()
        }
        await page.goto(origin + '/my-events?relation=joined&period=all')
        await expect(card(7).getByLabel('Visibility: private')).toBeVisible()
        await expect(card(8).getByText('Cancelled', { exact: true })).toBeVisible()
        await expect(card(6).getByText('Finished', { exact: true })).toBeVisible()
        await card(7).getByRole('button', { name: 'Leave event', exact: true }).click()
        await expect(card(7).getByText(/Leaving removes access/)).toBeVisible()
        await card(7).getByRole('button', { name: 'Confirm leave', exact: true }).click()
        await expect(card(7)).toHaveCount(0)
        await expect(
          page.getByRole('status').filter({ hasText: 'You have left this event.' }),
        ).toBeVisible()
        await page.goto(filtered)
        viewer = second
        await page.evaluate((value) => {
          localStorage.setItem('rollcall.auth', JSON.stringify(value))
          const channel = new BroadcastChannel('rollcall.auth')
          channel.postMessage({ event: 'SIGNED_IN', session: value })
          setTimeout(() => channel.close(), 100)
        }, session(second))
        await expect(card(3).getByRole('button', { name: 'Join event', exact: true })).toBeVisible()
        assert.equal(await card(3).getByRole('link', { name: 'Manage event', exact: true }).count(), 0)
        for (const path of ['/about', '/contact']) {
          await page.goto(origin + path)
          const back = page.getByRole('link', { name: 'Back to discovery', exact: true })
          await expect(back).toHaveCount(1)
          assert.equal(await back.getAttribute('href'), '/')
          assert.ok(
            (await back.boundingBox()).y <
              (await page.getByRole('heading', { level: 1 }).boundingBox()).y,
          )
        }
        for (const width of [320, 375, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 })
          await page.goto(filtered)
          await expect(card(1)).toBeVisible()
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            'grid does not overflow',
          )
          if (width === 375 || width === 1440)
            await page.screenshot({
              path: fileURLToPath(
                new URL('../.tmp/discovery-ux/cards-' + width + '-' + theme + '.png', import.meta.url),
              ),
              fullPage: true,
              animations: 'disabled',
            })
          await card(1).getByRole('link', { name: 'Table 1', exact: true }).click()
          await expect(preview).toBeVisible()
          assert.ok(
            await preview.evaluate((el) => el.scrollHeight > el.clientHeight),
            'preview scrolls internally',
          )
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            'dialog does not overflow',
          )
          if (width === 375 || width === 1440)
            await page.screenshot({
              path: fileURLToPath(
                new URL('../.tmp/discovery-ux/preview-' + width + '-' + theme + '.png', import.meta.url),
              ),
              fullPage: false,
              animations: 'disabled',
            })
          await page.getByRole('button', { name: 'Close event preview', exact: true }).click()
          await expect(preview).toHaveCount(0)
          await page.goto(origin + '/events/new')
          const mobileForm = page.getByRole('form', { name: 'Create event', exact: true })
          await expect(mobileForm).toBeVisible()
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            'form does not overflow',
          )
          if (width === 375 || width === 1440)
            await page.screenshot({
              path: fileURLToPath(
                new URL('../.tmp/discovery-ux/form-' + width + '-' + theme + '.png', import.meta.url),
              ),
              fullPage: true,
              animations: 'disabled',
            })
        }
        assert.deepEqual(errors, [])
        await context.close()
      }
    } finally {
      release()
      await browser?.close()
      await server.close()
    }
  },
)
