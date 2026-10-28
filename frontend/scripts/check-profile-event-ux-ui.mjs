import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

test(
  'effective profile drafts, display-name stability, event rules and accessible feedback',
  { timeout: 180000 },
  async () => {
    const server = await createServer({
      root: fileURLToPath(new URL('..', import.meta.url)),
      cacheDir: fileURLToPath(new URL('../.tmp/profile-event-ux-vite', import.meta.url)),
      server: { host: '127.0.0.1', port: 0 },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
          'https://synthetic-profile-event.supabase.co',
        ),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
          'sb_publishable_synthetic_profile_event',
        ),
        'import.meta.env.VITE_API_ORIGIN': JSON.stringify(''),
        'import.meta.env.VITE_ENABLE_DEMO_MODE': JSON.stringify('false'),
      },
    })
    await server.listen()
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port
    let browser,
      release = () => {}
    try {
      browser = await chromium.launch({
        headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      })
      await mkdir(fileURLToPath(new URL('../.tmp/profile-event-ux', import.meta.url)), {
        recursive: true,
      })
      for (const theme of ['dark', 'light']) {
        const id = '14000000-0000-4000-8000-000000000001'
        const user = {
          id,
          email: 'fixture@example.test',
          aud: 'authenticated',
          role: 'authenticated',
          user_metadata: {},
          app_metadata: {},
          created_at: '2026-10-27T00:05:00Z',
        }
        const session = {
          user,
          access_token: 'synthetic-profile-event',
          refresh_token: 'synthetic-profile-event-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        await context.addInitScript(
          ({ session, theme }) => {
            if (!sessionStorage.getItem('fixture')) {
              localStorage.setItem('rollcall.auth', JSON.stringify(session))
              localStorage.setItem('rollcall.theme', theme)
              sessionStorage.setItem('fixture', '1')
            }
          },
          { session, theme },
        )
        const page = await context.newPage(),
          errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('console', (message) => {
          if (
            message.type() === 'error' &&
            !/Failed to load resource:.*status of (403|409|503)/.test(message.text())
          )
            errors.push(message.text())
        })
        const games = [
          { id: 1, name: 'Dungeons & Dragons', category: 'role-playing' },
          { id: 3, name: 'Yu-Gi-Oh!', category: 'trading-card' },
        ].map((game) => ({ ...game, description: 'Tabletop gaming.', minPlayers: 2, maxPlayers: 6 }))
        let profile = {
          id,
          username: 'ognjen3211',
          displayName: 'Ognjen3211',
          biography: 'A tabletop player.',
          country: null,
          city: null,
          createdAt: user.created_at,
          updatedAt: user.created_at,
        }
        let saved = [],
          patches = 0,
          gameWrites = 0,
          mode = 'normal',
          waiting = 0,
          gate = Promise.resolve(),
          joinCalls = 0
        const own = () => ({
          ...profile,
          gameExperience: saved,
          birthYear: 2000,
          ageDeclaredAt: user.created_at,
          hasDateOfBirth: true,
        })
        const row = {
          id: '24000000-0000-4000-8000-000000000001',
          title: 'A local game table',
          game: { id: 1, name: games[0].name, category: 'role-playing' },
          city: { id: 1, name: 'Podgorica', administrativeDivision: null },
          country: { id: 1, isoCode: 'ME', name: 'Montenegro' },
          venue: 'Game room',
          startsAt: '2032-01-01T17:00:00Z',
          endsAt: '2032-01-01T20:00:00Z',
          capacity: 4,
          participantCount: 0,
          availableSlots: 4,
          tags: ['Casual'],
          visibility: 'public',
          status: 'scheduled',
          cover: { kind: 'default', imageUrl: '/images/role-playing.svg' },
          minimumAge: 15,
          experienceLevel: 'intermediate-plus',
        }
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url()),
            path = url.pathname,
            json = (value, status = 200) =>
              route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
          if (path === '/auth/v1/user') return json(user)
          if (path === '/api/me') return json({ id, email: user.email })
          if (path === '/api/me/account-status') {
            if (mode === 'pending') {
              waiting++
              await gate
            }
            return json({ status: 'active' })
          }
          if (path === '/api/me/permissions')
            return json({ role: 'user', capabilities: { accessAdmin: false, manageAdminRoles: false } })
          if (path === '/api/me/username-casing') {
            const body = route.request().postDataJSON()
            assert.equal(body.expected, profile.username)
            assert.equal(body.username.toLowerCase(), profile.username.toLowerCase())
            profile = { ...profile, username: body.username }
            return json(own())
          }
          if (path === '/api/me/profile') {
            if (route.request().method() === 'PATCH') {
              patches++
              const body = route.request().postDataJSON()
              assert.equal('birthYear' in body, false)
              assert.equal('username' in body, false)
              profile = { ...profile, displayName: body.displayName, biography: body.biography }
            }
            return json(own())
          }
          if (path.startsWith('/api/users/')) return json({ ...profile, gameExperience: saved })
          if (path === '/api/me/game-experience') {
            if (route.request().method() === 'PUT') {
              gameWrites++
              const body = route.request().postDataJSON()
              assert.deepEqual(
                body.expected,
                saved.map(({ gameId, experience }) => ({ gameId, experience })),
              )
              saved = body.games.map((game) => ({
                ...game,
                gameName: games.find((item) => item.id === game.gameId).name,
              }))
            }
            return json(saved)
          }
          if (path === '/api/games') return json(games)
          if (path === '/api/countries' || path === '/api/cities') return json([])
          if (path === '/api/events')
            return json({
              items: [row],
              pageInfo: { limit: Number(url.searchParams.get('limit') || 12), nextCursor: null },
            })
          if (path === '/api/events/' + row.id)
            return json({
              ...row,
              description: 'An in-person tabletop event for a friendly local community.',
              host: { id: '14000000-0000-4000-8000-000000000002', displayName: 'Table host' },
              price: 0,
              currency: 'EUR',
              createdAt: user.created_at,
              updatedAt: user.created_at,
              viewer: { userId: id, isHost: false, hasJoined: false },
            })
          if (path.endsWith('/attendees/me')) {
            joinCalls++
            return json(
              {
                code: mode === 'age-missing' ? 'AGE_INFORMATION_REQUIRED' : 'AGE_REQUIREMENT_NOT_MET',
                message: 'PRIVATE UPSTREAM DETAILS',
              },
              403,
            )
          }
          if (path.startsWith('/api/') || url.hostname.endsWith('.supabase.co')) return route.abort()
          return route.continue()
        })
        await page.goto(origin + '/profile/edit')
        await expect(page.getByRole('heading', { name: 'Edit Profile', level: 1 })).toBeVisible()
        await expect(page.getByText('Welcome, Ognjen3211', { exact: true })).toBeVisible()
        const avatar = page.getByRole('button', { name: 'Account menu', exact: true }),
          toggle = page.getByRole('button', { name: /Switch to .* theme/ })
        const before = { avatar: (await avatar.boundingBox()).x, toggle: (await toggle.boundingBox()).x }
        mode = 'pending'
        gate = new Promise((resolve) => {
          release = resolve
        })
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
          window.dispatchEvent(new Event('visibilitychange'))
        })
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
          window.dispatchEvent(new Event('visibilitychange'))
        })
        await expect.poll(() => waiting).toBeGreaterThan(0)
        await expect(page.getByText('Welcome, Ognjen3211', { exact: true })).toBeVisible()
        assert.equal((await avatar.boundingBox()).x, before.avatar)
        assert.equal((await toggle.boundingBox()).x, before.toggle)
        mode = 'normal'
        release()
        gate = Promise.resolve()
        const save = page.getByRole('button', { name: 'Save changes', exact: true })
        await expect(save).toBeDisabled()
        await page.getByLabel('Display name', { exact: false }).fill(' Ognjen3211 ')
        await expect(save).toBeDisabled()
        await page.getByLabel('Biography', { exact: true }).fill('Changed biography.')
        await expect(save).toBeEnabled()
        await page.getByLabel('Biography', { exact: true }).fill('A tabletop player.')
        await expect(save).toBeDisabled()
        assert.equal(patches, 0)
        await page.getByLabel('Username', { exact: true }).fill('AnotherHandle')
        await expect(
          page.getByRole('button', { name: 'Update capitalization', exact: true }),
        ).toBeDisabled()
        await page.getByLabel('Username', { exact: true }).fill('Ognjen3211')
        await page.getByRole('button', { name: 'Update capitalization', exact: true }).click()
        await expect(page.getByText('Username capitalization updated.', { exact: true })).toBeVisible()
        assert.equal(profile.username, 'Ognjen3211')
        assert.equal(profile.id, id)
        await expect(save).toBeDisabled()
        await page.getByLabel('Display name', { exact: false }).fill('Ognjen the Player')
        await save.click()
        await expect(page).toHaveURL(origin + '/profile')
        await expect(
          page.getByRole('status').filter({ hasText: 'Your profile has been saved.' }),
        ).toBeVisible()
        await expect(page.getByText('Welcome, Ognjen the Player', { exact: true })).toBeVisible()
        await page.reload()
        await expect(page.getByRole('heading', { name: 'My Profile', level: 1 })).toBeVisible()
        assert.equal(await page.getByText('Your profile has been saved.', { exact: true }).count(), 0)
        await page.goto(origin + '/profile/edit?tab=games')
        await page.getByLabel('Game', { exact: true }).selectOption('3')
        await page.getByLabel('Experience', { exact: true }).selectOption('veteran')
        await expect(save).toBeEnabled()
        assert.equal(gameWrites, 0)
        await save.click()
        await expect(page).toHaveURL(origin + '/profile')
        assert.equal(saved[0].experience, 'veteran')
        await page.reload()
        await expect(page.getByText('Yu-Gi-Oh!', { exact: true })).toBeVisible()
        await page.goto(origin + '/events')
        await expect(page.getByLabel('Minimum age 15', { exact: true })).toBeVisible()
        await expect(
          page.getByLabel('Recommended experience: Intermediate+', { exact: true }),
        ).toBeVisible()
        await page.getByRole('link', { name: row.title, exact: true }).click()
        await expect(page.getByRole('heading', { name: row.title, level: 1 })).toBeVisible()
        await page.getByRole('button', { name: 'Join Event', exact: true }).click()
        await expect(page.getByRole('alert')).toContainText('at least 15 years old')
        assert.equal(joinCalls, 1)
        assert.equal(
          (await page.locator('main').textContent()).includes('PRIVATE UPSTREAM DETAILS'),
          false,
        )
        mode = 'age-missing'
        await page.getByRole('button', { name: 'Join Event', exact: true }).click()
        await expect(
          page.getByRole('link', { name: 'Review account information', exact: true }),
        ).toBeVisible()
        await page.goto(origin + '/events/new')
        const experience = page.getByLabel(/^Recommended player experience/)
        await expect(experience).toBeVisible()
        await experience.selectOption('veteran-plus')
        assert.deepEqual(await experience.locator('option').allTextContents(), [
          'All levels',
          'Intermediate+',
          'Veteran+',
        ])
        await page.locator('button').filter({ hasText: 'Select tags (optional)' }).click()
        const tags = page.getByRole('dialog', { name: 'Event tags', exact: true })
        await tags.getByRole('checkbox', { name: 'Casual', exact: true }).check()
        await expect(tags.getByRole('checkbox', { name: /^Competitive/ })).toBeDisabled()
        await expect(
          tags.getByText('Casual and Competitive cannot be selected together.', { exact: true }),
        ).toBeVisible()
        await tags.getByRole('checkbox', { name: 'One-shot', exact: true }).check()
        await expect(tags.getByRole('checkbox', { name: /^Campaign/ })).toBeDisabled()
        assert.equal(
          await tags.getByRole('checkbox', { name: 'Beginner friendly', exact: true }).count(),
          0,
        )
        await tags.getByRole('checkbox', { name: 'Bring your own deck', exact: true }).check()
        await tags.getByRole('checkbox', { name: 'Equipment provided', exact: true }).check()
        await tags.getByRole('button', { name: 'Done', exact: true }).click()
        for (const width of [320, 375, 768, 1440]) {
          await page.setViewportSize({ width, height: 900 })
          await page.goto(origin + '/')
          const heading = page.getByRole('heading', { name: /Good games/ })
          await expect(heading).toBeVisible()
          assert.equal(
            await heading.evaluate((el) => getComputedStyle(el).textAlign),
            width < 768 ? 'center' : 'left',
          )
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            'no horizontal overflow',
          )
          if (width === 375 || width === 1440)
            await page.screenshot({
              path: fileURLToPath(
                new URL(
                  '../.tmp/profile-event-ux/home-' + width + '-' + theme + '.png',
                  import.meta.url,
                ),
              ),
              fullPage: true,
              animations: 'disabled',
            })
          await page.goto(origin + '/events')
          await expect(page.getByLabel('Minimum age 15', { exact: true })).toBeVisible()
          if (width === 375)
            await page.screenshot({
              path: fileURLToPath(
                new URL('../.tmp/profile-event-ux/events-' + theme + '.png', import.meta.url),
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
