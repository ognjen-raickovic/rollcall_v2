import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

test(
  'account menu, preserved logout, My Events and complete discovery controls work across themes and widths',
  { timeout: 120000 },
  async () => {
    const server = await createServer({
      root: fileURLToPath(new URL('..', import.meta.url)),
      cacheDir: fileURLToPath(new URL('../.tmp/navigation-vite', import.meta.url)),
      server: { host: '127.0.0.1', port: 0 },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic-navigation.supabase.co'),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
          'sb_publishable_synthetic_navigation',
        ),
        'import.meta.env.VITE_API_ORIGIN': JSON.stringify(''),
        'import.meta.env.VITE_ENABLE_DEMO_MODE': JSON.stringify('false'),
      },
    })
    await server.listen()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    const id = '10000000-0000-4000-8000-000000000001',
      email = 'fixture@example.test',
      user = {
        id,
        email,
        aud: 'authenticated',
        role: 'authenticated',
        user_metadata: {},
        app_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      }
    const session = {
      user,
      access_token: 'synthetic-access',
      refresh_token: 'synthetic-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    }
    const games = [
      {
        id: 1,
        name: 'Dungeons & Dragons',
        category: 'role-playing',
        description: 'Fantasy tables',
        minPlayers: 2,
        maxPlayers: 7,
      },
      {
        id: 2,
        name: 'Catan',
        category: 'board-game',
        description: 'Board game meetups',
        minPlayers: 3,
        maxPlayers: 4,
      },
    ]
    const base = {
      game: { id: 1, name: 'Dungeons & Dragons', category: 'role-playing' },
      city: { id: 1, name: 'Podgorica', administrativeDivision: null },
      country: { id: 1, isoCode: 'ME', name: 'Montenegro' },
      venue: 'Community game room',
      startsAt: new Date(Date.now() + 604800000).toISOString(),
      endsAt: new Date(Date.now() + 612000000).toISOString(),
      capacity: 4,
      participantCount: 1,
      availableSlots: 3,
      tags: ['Casual'],
      visibility: 'public',
      status: 'scheduled',
      cover: { kind: 'default', imageUrl: '/images/role-playing.svg' },
    }
    const rows = ['Zeta game night', 'Alpha one-shot', 'Beta board games'].map((title, index) => ({
      ...base,
      id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      title,
      ...(index === 2
        ? {
            game: { id: 2, name: 'Catan', category: 'board-game' },
            city: { id: 2, name: 'Niksic', administrativeDivision: null },
          }
        : {}),
    }))
    let browser
    try {
      browser = await chromium.launch({
        headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      })
      const context = await browser.newContext()
      await context.addInitScript(
        ({ session }) => {
          if (!sessionStorage.getItem('fixture-started')) {
            localStorage.setItem('rollcall.auth', JSON.stringify(session))
            sessionStorage.setItem('fixture-started', 'true')
          }
        },
        { session },
      )
      const page = await context.newPage(),
        errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (
          message.type() === 'error' &&
          !/Failed to load resource:.*status of (401|503)/.test(message.text())
        )
          errors.push(message.text())
      })
      let logoutCalls = 0,
        apiCalls = 0,
        mode = 'normal',
        requests = [],
        state = 'active'
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url()),
          path = url.pathname,
          json = (body, status = 200) =>
            route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
        if (path === '/auth/v1/logout') {
          logoutCalls++
          return route.fulfill({ status: 204 })
        }
        if (path === '/auth/v1/user') return json(user)
        if (path === '/api/me')
          return mode === 'verification-error'
            ? json({ code: 'UNAUTHENTICATED', message: 'PRIVATE DETAIL' }, 401)
            : json({ id, email })
        if (path === '/api/me/account-status')
          return mode === 'verification-error'
            ? json({ code: 'DEPENDENCY_UNAVAILABLE' }, 503)
            : json({ status: state })
        if (path === '/api/me/permissions')
          return json({ role: 'user', capabilities: { accessAdmin: false, manageAdminRoles: false } })
        if (path === '/api/games') return json(games)
        if (path === '/api/countries')
          return json([{ id: 1, isoCode: 'ME', name: 'Montenegro', enabled: true }])
        if (path === '/api/me/profile')
          return json({
            id,
            username: 'FixturePlayer',
            displayName: 'Fixture Player',
            biography: null,
            country: null,
            city: null,
            createdAt: user.created_at,
            updatedAt: user.created_at,
            gameExperience: [],
            birthYear: null,
            hasDateOfBirth: false,
            ageDeclaredAt: null,
          })
        if (path.startsWith('/api/users/'))
          return json({
            id,
            username: 'FixturePlayer',
            displayName: 'Fixture Player',
            biography: null,
            country: null,
            city: null,
            createdAt: user.created_at,
            updatedAt: user.created_at,
            gameExperience: [],
          })
        if (path === '/api/me/events')
          return json({
            items:
              url.searchParams.get('relation') === 'joined'
                ? []
                : [{ ...rows[0], title: 'My private Podgorica campaign', visibility: 'private' }],
            pageInfo: { limit: 12, nextCursor: null },
          })
        if (path === '/api/events') {
          apiCalls++
          requests.push(Object.fromEntries(url.searchParams))
          if (mode === 'unavailable') return json({ code: 'DEPENDENCY_UNAVAILABLE' }, 503)
          let items = rows.filter(
            (row) =>
              (!url.searchParams.get('search') ||
                row.title.toLowerCase().includes(url.searchParams.get('search').toLowerCase())) &&
              (!url.searchParams.get('category') || row.game.category === url.searchParams.get('category')),
          )
          if (url.searchParams.get('sort') === 'title-asc')
            items = [...items].sort((a, b) => a.title.localeCompare(b.title))
          return json({
            items,
            pageInfo: { limit: Number(url.searchParams.get('limit') || 12), nextCursor: null },
          })
        }
        if (path.startsWith('/api/')) return json([])
        if (url.origin !== origin) return json({}, 503)
        return route.continue()
      })
      await mkdir(new URL('../.tmp/navigation-discovery/', import.meta.url), { recursive: true })
      const main = page.locator('main'),
        avatar = page.getByRole('button', { name: 'Account menu', exact: true })
      for (const width of [375, 1440])
        for (const theme of ['dark', 'light']) {
          await page.setViewportSize({ width, height: 1000 })
          await page.goto(origin + '/events')
          await main.getByRole('link', { name: 'Alpha one-shot', exact: true }).waitFor()
          await page.evaluate((theme) => {
            document.documentElement.dataset.theme = theme
            document.documentElement.classList.toggle('dark', theme === 'dark')
            localStorage.setItem('rollcall.theme', theme)
          }, theme)
          await page.screenshot({
            animations: 'disabled',
            path: fileURLToPath(
              new URL(`../.tmp/navigation-discovery/events-${width}-${theme}.png`, import.meta.url),
            ),
            fullPage: true,
          })
          await main.getByText('More filters', { exact: true }).click()
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
          await page.screenshot({
            animations: 'disabled',
            path: fileURLToPath(
              new URL(`../.tmp/navigation-discovery/advanced-${width}-${theme}.png`, import.meta.url),
            ),
            fullPage: true,
          })
          await main.getByText('More filters', { exact: true }).click()
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
          await avatar.focus()
          await page.keyboard.press(width === 375 ? 'Space' : 'Enter')
          await page.getByRole('menuitem', { name: 'My Profile', exact: true }).waitFor()
          assert.deepEqual(await page.getByRole('menuitem').allTextContents(), [
            'My Profile',
            'Settings',
            'My Events',
            'Log out',
          ])
          await page.keyboard.press('ArrowDown')
          assert.equal(
            await page
              .getByRole('menuitem', { name: 'Settings', exact: true })
              .evaluate((el) => el === document.activeElement),
            true,
          )
          await page.keyboard.press('Escape')
          await expect(avatar).toBeFocused()
          await avatar.click()
          await page.mouse.click(5, 300)
          await page.getByRole('menu').waitFor({ state: 'detached' })
          await avatar.click()
          await page.getByRole('menuitem', { name: 'Log out', exact: true }).click()
          const dialog = page.getByRole('dialog', { name: 'Log out of RollCall?' })
          await expect(dialog.getByRole('button', { name: 'No, stay', exact: true })).toBeFocused()
          assert.deepEqual(await dialog.getByRole('button').allTextContents(), ['Yes, log out', 'No, stay'])
          await page.keyboard.press('Escape')
          await dialog.waitFor({ state: 'detached' })
          await expect(avatar).toBeFocused()
          assert.equal(logoutCalls, 0)
          await avatar.click()
          await page.getByRole('menuitem', { name: 'My Events', exact: true }).click()
          await main.getByRole('link', { name: 'My private Podgorica campaign', exact: true }).waitFor()
          await main.getByRole('button', { name: "Events I've joined", exact: true }).click()
          await main.getByText('No joined events match this period.', { exact: true }).waitFor()
          await page.goto(origin + '/login')
          await page.waitForURL('**/events')
        }
      // Query parameters are sent to the backend, never applied only to loaded cards.
      await page.goto(origin + '/events')
      await main.getByRole('link', { name: 'Alpha one-shot', exact: true }).waitFor()
      await main.getByText('More filters', { exact: true }).click()
      await page.getByLabel('Start date from', { exact: true }).fill('2026-11-01')
      await page.getByLabel('Start date to', { exact: true }).fill('2026-11-15')
      await page.getByLabel('Start time from', { exact: true }).fill('16:00')
      await page.getByLabel('Start time to', { exact: true }).fill('22:00')
      await page.getByLabel('Game category', { exact: true }).selectOption('board-game')
      await page.getByLabel('Casual', { exact: true }).check()
      await page.getByLabel('Event experience', { exact: true }).selectOption('beginner')
      await page.getByLabel('Advertised minimum age at most', { exact: true }).fill('18')
      await page.getByLabel('Sort by', { exact: true }).selectOption('title-asc')
      await main.getByRole('button', { name: 'Search', exact: true }).click()
      await page.waitForURL((url) => url.searchParams.get('category') === 'board-game')
      await expect.poll(() => requests.at(-1)?.category).toBe('board-game')
      await main.getByRole('link', { name: 'Beta board games', exact: true }).waitFor()
      await expect(main.getByRole('link', { name: 'Alpha one-shot', exact: true })).toHaveCount(0)
      const last = requests.at(-1)
      assert.equal(last.category, 'board-game')
      assert.equal(last.sort, 'title-asc')
      assert.equal(last.tags, 'Casual')
      assert.equal(last.startsBeforeExclusive, 'true')
      assert.equal(last.maxMinimumAge, '18')
      assert.equal(last.experience, 'beginner')
      assert.ok(last.timeZone)
      assert.equal(new URL(page.url()).searchParams.get('from'), '2026-11-01')
      await main.getByRole('link', { name: 'Reset filters', exact: true }).click()
      await main.getByRole('link', { name: 'Alpha one-shot', exact: true }).waitFor()
      await page.goBack()
      await main.getByRole('link', { name: 'Beta board games', exact: true }).waitFor()
      assert.equal(await page.getByLabel('Start date from', { exact: true }).inputValue(), '2026-11-01')
      await page.goForward()
      await main.getByRole('link', { name: 'Alpha one-shot', exact: true }).waitFor()
      const before = apiCalls
      await page.goto(origin + '/events?from=2026-11-20&to=2026-11-01')
      await main.getByRole('alert').waitFor()
      assert.equal(apiCalls, before)
      await page.goto(origin + '/events?search=NoSuchEvent')
      await main.getByText('No events match your filters.', { exact: true }).waitFor()
      mode = 'unavailable'
      await page.goto(origin + '/events')
      await main.getByText('We couldn’t load the event collection.', { exact: true }).waitFor()
      mode = 'verification-error'
      await page.goto(origin + '/account')
      await main.getByRole('button', { name: 'Retry verification', exact: true }).waitFor()
      await main.getByRole('button', { name: 'Retry account access', exact: true }).waitFor()
      assert.equal((await main.textContent()).includes('PRIVATE DETAIL'), false)
      mode = 'normal'
      state = 'suspended'
      await page.goto(origin + '/my-events')
      await main.getByRole('heading', { name: 'Account suspended', exact: true }).waitFor()
      state = 'active'
      await page.goto(origin + '/account')
      await main.getByRole('button', { name: 'Log out', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Yes, log out', exact: true }).click()
      await page.waitForURL('**/login?returnTo=%2Faccount')
      await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible()
      assert.equal(await avatar.count(), 0)
      for (const width of [375, 1440]) {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(origin + '/register')
        await main.getByRole('heading', { name: 'Create your account', exact: true }).waitFor()
        const back = await main.getByRole('link', { name: 'Back to discovery', exact: true }).boundingBox(),
          card = await page.getByRole('region', { name: 'Account access', exact: true }).boundingBox()
        assert.ok(back.y < card.y)
        if (width === 1440) assert.ok(back.x < card.x)
        assert.ok(Math.abs(card.x + card.width / 2 - width / 2) < 2)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      }
      assert.deepEqual(errors, [])
    } finally {
      await browser?.close()
      await server.close()
    }
  },
)
