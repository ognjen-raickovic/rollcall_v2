import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

test(
  'profile drafts, explicit saves, tabs and account polish work on mobile/desktop in both themes',
  { timeout: 120000 },
  async () => {
    const server = await createServer({
      root: fileURLToPath(new URL('..', import.meta.url)),
      cacheDir: fileURLToPath(new URL('../.tmp/profile-editor-vite', import.meta.url)),
      server: { host: '127.0.0.1', port: 0 },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic-profile.supabase.co'),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
          'sb_publishable_synthetic_profile',
        ),
        'import.meta.env.VITE_API_ORIGIN': JSON.stringify(''),
        'import.meta.env.VITE_ENABLE_DEMO_MODE': JSON.stringify('false'),
      },
    })
    await server.listen()
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port
    let browser
    try {
      browser = await chromium.launch({
        headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      })
      await mkdir(fileURLToPath(new URL('../.tmp/profile-editor', import.meta.url)), { recursive: true })
      for (const width of [375, 1440])
        for (const theme of ['dark', 'light']) {
          const id = '11000000-0000-4000-8000-000000000001',
            other = '11000000-0000-4000-8000-000000000002'
          let viewer = id
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
            access_token: 'synthetic-profile-access',
            refresh_token: 'synthetic-profile-refresh',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }
          const context = await browser.newContext({
            viewport: { width, height: 1000 },
            colorScheme: theme,
          })
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
          page.on('console', (msg) => {
            if (
              msg.type() === 'error' &&
              !/Failed to load resource:.*status of (409|503)/.test(msg.text())
            )
              errors.push(msg.text())
          })
          const games = [
            { id: 1, name: 'Dungeons & Dragons', category: 'role-playing' },
            { id: 2, name: 'Catan', category: 'board-game' },
            { id: 3, name: 'Yu-Gi-Oh!', category: 'trading-card' },
          ].map((game) => ({ ...game, description: 'A tabletop game.', minPlayers: 2, maxPlayers: 6 }))
          const countries = [
            { id: 1, isoCode: 'ME', name: 'Montenegro' },
            { id: 2, isoCode: 'RS', name: 'Serbia' },
          ]
          const city = {
            id: 21,
            countryId: 2,
            countryIsoCode: 'RS',
            countryName: 'Serbia',
            name: 'Belgrade',
            administrativeDivision: null,
            admin1Code: null,
            admin2Code: null,
            latitude: null,
            longitude: null,
          }
          let saved = [{ gameId: 1, gameName: games[0].name, experience: 'veteran' }],
            puts = 0,
            patches = 0,
            fail = false
          let profile = {
            id,
            username: 'ProfilePlayer',
            displayName: 'Profile Player',
            biography: 'A tabletop player.',
            country: countries[0],
            city: null,
            createdAt: user.created_at,
            updatedAt: user.created_at,
          }
          const publicProfile = () => ({
            ...profile,
            id: viewer,
            displayName: viewer === id ? profile.displayName : 'Second account',
            gameExperience: viewer === id ? saved : [],
          })
          await page.route('**/*', (route) => {
            const url = new URL(route.request().url()),
              path = url.pathname,
              json = (body, status = 200) =>
                route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
            if (path === '/auth/v1/user') return json({ ...user, id: viewer })
            if (path === '/api/me') return json({ id: viewer, email: user.email })
            if (path === '/api/me/account-status') return json({ status: 'active' })
            if (path === '/api/me/permissions')
              return json({
                role: 'user',
                capabilities: { accessAdmin: false, manageAdminRoles: false },
              })
            if (path === '/api/me/profile') {
              if (route.request().method() === 'PATCH') {
                patches++
                const body = route.request().postDataJSON()
                assert.equal('birthYear' in body, false)
                profile = {
                  ...profile,
                  ...body,
                  country: countries.find((c) => c.id === body.countryId) ?? null,
                  city: body.cityId ? city : null,
                }
              }
              return json({
                ...publicProfile(),
                birthYear: 2000,
                ageDeclaredAt: user.created_at,
                hasDateOfBirth: true,
              })
            }
            if (path === '/api/me/game-experience') {
              if (route.request().method() === 'PUT') {
                puts++
                if (fail) return json({ code: 'DEPENDENCY_UNAVAILABLE' }, 503)
                const body = route.request().postDataJSON()
                assert.deepEqual(
                  body.expected,
                  saved
                    .map(({ gameId, experience }) => ({ gameId, experience }))
                    .sort((a, b) => a.gameId - b.gameId),
                )
                saved = body.games.map((game) => ({
                  ...game,
                  gameName: games.find((g) => g.id === game.gameId).name,
                }))
              }
              return json(viewer === id ? saved : [])
            }
            if (path.startsWith('/api/users/')) return json(publicProfile())
            if (path === '/api/games') return json(games)
            if (path === '/api/countries') return json(countries)
            if (path === '/api/cities')
              return json(url.searchParams.get('country') === 'RS' ? [city] : [])
            if (path === '/api/events')
              return json({ items: [], pageInfo: { limit: 12, nextCursor: null } })
            if (path.startsWith('/api/') || url.hostname.endsWith('.supabase.co')) return route.abort()
            return route.continue()
          })
          await page.goto(origin + '/profile/edit')
          await expect(page.getByRole('heading', { name: 'Edit Profile', exact: true })).toBeVisible()
          await expect(page.getByRole('tab', { name: 'Profile', exact: true })).toHaveAttribute(
            'aria-selected',
            'true',
          )
          await expect(page.getByLabel('Birth year (private)')).toHaveAttribute('readonly', '')
          await expect(page.getByText('27. October 2026.', { exact: false })).toBeVisible()
          assert.equal(await page.getByText('Share what feels right').count(), 0)
          await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled()
          await page.getByLabel('Display name').fill('  Profile Player  ')
          await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled()
          await page.getByLabel('Display name').fill('Changed name')
          await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled()
          await page.getByLabel('Display name').fill('Profile Player')
          await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled()
          await page.getByLabel('Display name').fill('Draft name')
          await page.getByRole('tab', { name: 'Profile', exact: true }).focus()
          await page.keyboard.press('ArrowRight')
          await expect(page.getByRole('tab', { name: 'My games', exact: true })).toHaveAttribute(
            'aria-selected',
            'true',
          )
          await page.getByLabel('Game', { exact: true }).selectOption('2')
          await page.getByLabel('Experience', { exact: true }).selectOption('intermediate')
          await page.getByRole('button', { name: 'Add another game', exact: true }).click()
          assert.equal(puts, 0)
          await page.getByRole('tab', { name: 'Profile', exact: true }).click()
          await expect(page.getByLabel('Display name')).toHaveValue('Draft name')
          await page.getByRole('tab', { name: 'My games', exact: true }).click()
          await expect(page.getByLabel('Experience for Catan')).toHaveValue('intermediate')
          await page.goBack()
          await expect(page.getByLabel('Display name')).toHaveValue('Draft name')
          await page.goForward()
          await expect(page.getByLabel('Experience for Catan')).toHaveValue('intermediate')
          await page.screenshot({
            path: fileURLToPath(
              new URL('../.tmp/profile-editor/games-' + width + '-' + theme + '.png', import.meta.url),
            ),
            fullPage: true,
            animations: 'disabled',
          })
          await page.getByRole('link', { name: 'Cancel', exact: true }).click()
          await expect(page).toHaveURL(origin + '/profile')
          assert.equal(puts, 0)
          assert.equal(saved.length, 1)
          await page.goto(origin + '/profile/edit?tab=games')
          await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled()
          await page.getByLabel('Game', { exact: true }).selectOption('2')
          await page.getByRole('button', { name: 'Add another game', exact: true }).click()
          assert.equal(
            await page.getByLabel('Game', { exact: true }).locator('option[value="2"]').count(),
            0,
          )
          await page.getByLabel('Experience for Dungeons & Dragons').selectOption('intermediate')
          fail = true
          await page.getByRole('button', { name: 'Save changes', exact: true }).click()
          await expect(page.getByRole('alert')).toContainText('Your draft has been kept')
          await expect(page.getByLabel('Experience for Dungeons & Dragons')).toHaveValue('intermediate')
          assert.equal(saved.length, 1)
          fail = false
          await page.getByRole('button', { name: 'Save changes', exact: true }).click()
          await expect(page).toHaveURL(origin + '/profile')
          await expect(page.getByRole('status')).toContainText('saved')
          assert.equal(saved.length, 2)
          await page.reload()
          await expect(page.getByText('Catan', { exact: true })).toBeVisible()
          await page.goto(origin + '/profile/edit?tab=games')
          await page.getByRole('button', { name: 'Remove Catan', exact: true }).click()
          await page.getByRole('button', { name: 'Save changes', exact: true }).click()
          await expect(page).toHaveURL(origin + '/profile')
          assert.equal(saved.length, 1)
          await page.goto(origin + '/profile/edit?tab=games')
          await page.getByLabel('Game', { exact: true }).selectOption('3')
          await page.getByLabel('Experience', { exact: true }).selectOption('veteran')
          await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled()
          const beforeSave = puts
          await expect(page.getByRole('status').filter({ hasText: 'Yu-Gi-Oh!' })).toBeVisible()
          assert.equal(puts, beforeSave)
          await page.getByRole('button', { name: 'Save changes', exact: true }).click()
          await expect(page).toHaveURL(origin + '/profile')
          assert.equal(saved.find((game) => game.gameId === 3).experience, 'veteran')
          await page.reload()
          await expect(page.getByText('Yu-Gi-Oh!', { exact: true })).toBeVisible()
          await page.goto(origin + '/users/' + id)
          await expect(page.getByText('Dungeons & Dragons', { exact: true })).toBeVisible()
          assert.equal(await page.getByText('2000', { exact: true }).count(), 0)
          await page.goto(origin + '/profile/edit')
          await page.getByLabel('Display name').fill('Saved player')
          await page.getByLabel('Biography', { exact: true }).fill('Saved biography.')
          await page.getByLabel('Country', { exact: true }).selectOption('RS')
          const cityInput = page.getByRole('combobox', { name: /City or settlement/ })
          await cityInput.fill('Bel')
          await page.getByRole('option', { name: /Belgrade/ }).click()
          await page.screenshot({
            path: fileURLToPath(
              new URL('../.tmp/profile-editor/profile-' + width + '-' + theme + '.png', import.meta.url),
            ),
            fullPage: true,
            animations: 'disabled',
          })
          await page.getByRole('button', { name: 'Save changes', exact: true }).click()
          await expect(page).toHaveURL(origin + '/profile')
          assert.equal(patches, 1)
          assert.equal(profile.displayName, 'Saved player')
          await page.goto(origin + '/profile/edit')
          await page.getByLabel('Display name').fill('Discard this')
          await page.getByRole('link', { name: 'Cancel', exact: true }).click()
          assert.equal(patches, 1)
          await page.goto(origin + '/account')
          await expect(page.getByText('27. October 2026.', { exact: true })).toBeVisible()
          assert.equal(await page.getByRole('link', { name: 'Browse events', exact: true }).count(), 0)
          assert.equal(
            await page.locator('button:not([disabled])').filter({ hasText: 'Delete account' }).count(),
            0,
          )
          await page.goto(origin + '/profile/edit')
          await page.getByLabel('Display name').fill('Private first draft')
          viewer = other
          await page.evaluate(
            (session) => {
              localStorage.setItem('rollcall.auth', JSON.stringify(session))
              // Exercise the SDK's actual cross-tab notification channel.
              const channel = new BroadcastChannel('rollcall.auth')
              channel.postMessage({ event: 'SIGNED_IN', session })
              setTimeout(() => channel.close(), 100)
            },
            { ...session, user: { ...user, id: other } },
          )
          await expect(page.getByLabel('Display name')).toHaveValue('Second account')
          await page.getByRole('tab', { name: 'My games', exact: true }).click()
          await expect(page.getByText('No games added yet.', { exact: false })).toBeVisible()
          await page.emulateMedia({ reducedMotion: 'reduce' })
          await expect(page.getByRole('tabpanel')).toHaveCSS('animation-name', 'none')
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            'no horizontal overflow',
          )
          assert.deepEqual(errors, [])
          await context.close()
        }
    } finally {
      await browser?.close()
      await server.close()
    }
  },
)
