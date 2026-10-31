import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

test(
  'responsive navigation preserves verified identity, drawer focus, theme, permissions and confirmed logout',
  { timeout: 180000 },
  async () => {
    const server = await createServer({
      root: fileURLToPath(new URL('..', import.meta.url)),
      cacheDir: fileURLToPath(new URL('../.tmp/responsive-nav-vite', import.meta.url)),
      server: { host: '127.0.0.1', port: 0 },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic-responsive.supabase.co'),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
          'sb_publishable_synthetic_responsive',
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
      await mkdir(fileURLToPath(new URL('../.tmp/responsive-navigation', import.meta.url)), {
        recursive: true,
      })
      const id = '13000000-0000-4000-8000-000000000001',
        other = '13000000-0000-4000-8000-000000000002'
      const user = {
        id,
        email: 'private-fixture@example.test',
        aud: 'authenticated',
        role: 'authenticated',
        user_metadata: {},
        app_metadata: {},
        created_at: '2026-10-27T00:05:00Z',
      }
      const session = {
        user,
        access_token: 'synthetic-responsive-access',
        refresh_token: 'synthetic-responsive-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }
      for (const theme of ['dark', 'light']) {
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
        page.on('console', (msg) => {
          if (msg.type() === 'error' && !/Failed to load resource:.*status of (401|503)/.test(msg.text()))
            errors.push(msg.text())
        })
        let viewer = id,
          status = 'active',
          admin = true,
          username = 'Ognjen3211',
          displayName = 'Ognjen the Player',
          mode = 'normal',
          logoutCalls = 0
        let releaseIdentity
        let identityGate = Promise.resolve()
        const profile = () => ({
          id: viewer,
          username,
          displayName,
          biography: 'Good company around a table.',
          country: null,
          city: null,
          createdAt: user.created_at,
          updatedAt: user.created_at,
          gameExperience: [],
        })
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url()),
            path = url.pathname,
            json = (body, status = 200) =>
              route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
          if (path === '/auth/v1/logout') {
            logoutCalls++
            if (mode === 'logout-error') return json({ message: 'Temporary failure' }, 503)
            return route.fulfill({ status: 204 })
          }
          if (path === '/auth/v1/user') return json({ ...user, id: viewer })
          if (path === '/api/me') {
            const requestedViewer = viewer
            await identityGate
            return mode === 'identity-error'
              ? json({ code: 'UNAUTHENTICATED' }, 401)
              : json({ id: requestedViewer, email: user.email })
          }
          if (path === '/api/me/account-status') return json({ status })
          if (path === '/api/me/permissions')
            return json({
              role: admin ? 'admin' : 'user',
              capabilities: { accessAdmin: admin, manageAdminRoles: false },
            })
          if (path.startsWith('/api/users/')) return json(profile())
          if (path === '/api/me/profile')
            return json({ ...profile(), birthYear: null, ageDeclaredAt: null, hasDateOfBirth: false })
          if (
            path === '/api/me/game-experience' ||
            path === '/api/games' ||
            path === '/api/countries' ||
            path === '/api/cities'
          )
            return json([])
          if (path === '/api/me/events' || path === '/api/events')
            return json({ items: [], pageInfo: { limit: 12, nextCursor: null } })
          if (path.startsWith('/api/') || url.hostname.endsWith('.supabase.co')) return route.abort()
          return route.continue()
        })
        const drawer = page.getByRole('dialog', { name: 'Menu', exact: true })
        const opener = page.getByRole('button', { name: 'Open menu', exact: true })
        const overflow = async () =>
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            'no horizontal overflow',
          )
        const openMenu = async () => {
          await opener.click()
          await expect(drawer).toBeVisible()
        }
        const closeMenu = async () => {
          await page.keyboard.press('Escape')
          await expect(drawer).toBeHidden()
          await expect(opener).toBeFocused()
        }
        for (const width of [320, 375, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 })
          await page.goto(origin + '/about')
          await expect(page.getByRole('heading', { name: 'About RollCall', level: 1 })).toBeVisible()
          const header = page.getByRole('navigation', { name: 'Main navigation', exact: true })
          await expect(header.getByRole('link', { name: 'RollCall', exact: true })).toBeVisible()
          assert.equal(await header.getByRole('link', { name: 'Discover', exact: true }).count(), 0)
          await overflow()
          if (width < 1280) {
            await expect(opener).toBeVisible()
            assert.equal(await header.getByRole('link', { name: 'Explore events', exact: true }).count(), 0)
            assert.equal(await header.getByRole('button', { name: 'Account menu', exact: true }).count(), 0)
            const headerHeight = (await header.boundingBox()).height
            await openMenu()
            await expect(drawer.getByRole('link', { name: 'My Profile', exact: true })).toHaveText(
              'Ognjen3211',
            )
            assert.deepEqual(
              await drawer
                .getByRole('navigation', { name: 'Mobile navigation' })
                .getByRole('link')
                .allTextContents(),
              ['Explore events', 'Host an event', 'About Us', 'Contact'],
            )
            await expect(drawer.getByRole('link', { name: 'About Us', exact: true })).toHaveAttribute(
              'aria-current',
              'page',
            )
            await expect(drawer.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible()
            assert.equal((await page.locator('header nav').first().boundingBox()).height, headerHeight)
            assert.ok(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked')))
            assert.equal(await page.getByRole('button', { name: /Switch to .* theme/ }).count(), 1)
            await expect.poll(() => drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true)
            for (let i = 0; i < 16; i++) {
              await page.keyboard.press('Tab')
              assert.ok(await drawer.evaluate((el) => el.contains(document.activeElement)))
            }
            if (width === 375)
              await page.screenshot({
                path: fileURLToPath(
                  new URL('../.tmp/responsive-navigation/mobile-' + theme + '.png', import.meta.url),
                ),
                fullPage: false,
                animations: 'disabled',
              })
            await closeMenu()
            await openMenu()
            await page.mouse.click(4, 200)
            await expect(drawer).toBeHidden()
            await expect(opener).toBeFocused()
            await openMenu()
            await drawer.getByRole('button', { name: 'Close menu', exact: true }).click()
            await expect(drawer).toBeHidden()
            await expect(opener).toBeFocused()
            await openMenu()
            await drawer.getByRole('link', { name: 'Contact', exact: true }).click()
            await expect(page).toHaveURL(origin + '/contact')
            await expect(drawer).toBeHidden()
            await page.goBack()
            await expect(page).toHaveURL(origin + '/about')
          } else {
            await expect(opener).toHaveCount(0)
            await expect(header.getByText('Welcome, Ognjen the Player', { exact: true })).toBeVisible()
            const greeting = await header
                .getByText('Welcome, Ognjen the Player', { exact: true })
                .boundingBox(),
              avatar = await header.getByRole('button', { name: 'Account menu', exact: true }).boundingBox(),
              toggle = await header.getByRole('button', { name: /Switch to .* theme/ }).boundingBox()
            assert.ok(greeting.x < avatar.x && avatar.x < toggle.x)
            assert.equal(
              await header
                .getByRole('link')
                .filter({ hasText: /Explore events|Host an event|About Us|Contact/ })
                .count(),
              4,
            )
            assert.equal(await header.getByText(user.email, { exact: true }).count(), 0)
            await page.screenshot({
              path: fileURLToPath(
                new URL('../.tmp/responsive-navigation/desktop-' + theme + '.png', import.meta.url),
              ),
              fullPage: false,
              animations: 'disabled',
            })
            await header.getByRole('button', { name: 'Account menu', exact: true }).click()
            await expect(page.getByRole('menuitem', { name: 'Dashboard', exact: true })).toBeVisible()
            assert.deepEqual(await page.getByRole('menuitem').allTextContents(), [
              'My Profile',
              'Settings',
              'My Events',
              'Log out',
            ])
            await page.keyboard.press('Escape')
          }
        }
        await page.setViewportSize({ width: 375, height: 650 })
        await openMenu()
        await page.setViewportSize({ width: 1440, height: 900 })
        await expect(drawer).toBeHidden()
        await expect(page.getByRole('button', { name: 'Account menu', exact: true })).toBeVisible()
        assert.equal(await page.getByRole('button', { name: /Switch to .* theme/ }).count(), 1)
        await page.setViewportSize({ width: 375, height: 650 })
        await openMenu()
        const before = await page.evaluate(() => document.documentElement.dataset.theme)
        await drawer.getByRole('button', { name: /Switch to .* theme/ }).click()
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).not.toBe(before)
        await expect(drawer.getByRole('link', { name: 'My Profile', exact: true })).toHaveText('Ognjen3211')
        await closeMenu()
        await page.reload()
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).not.toBe(before)
        await openMenu()
        await drawer.getByRole('link', { name: 'My Profile', exact: true }).click()
        await expect(page).toHaveURL(origin + '/profile')
        await expect(drawer).toBeHidden()
        await openMenu()
        await drawer.getByRole('link', { name: 'My Events', exact: true }).click()
        await expect(page).toHaveURL(origin + '/my-events')
        await openMenu()
        await drawer.getByRole('link', { name: 'Settings', exact: true }).click()
        await expect(page).toHaveURL(origin + '/account')
        await openMenu()
        await drawer.getByRole('button', { name: 'Log out', exact: true }).click()
        const confirmation = page.getByRole('dialog', { name: 'Log out of RollCall?', exact: true })
        await expect(drawer).toBeHidden()
        await expect(confirmation).toBeVisible()
        await expect(confirmation.getByRole('button', { name: 'No, stay', exact: true })).toBeFocused()
        assert.deepEqual(await confirmation.getByRole('button').allTextContents(), [
          'Yes, log out',
          'No, stay',
        ])
        assert.equal(logoutCalls, 0)
        await page.keyboard.press('Escape')
        await expect(confirmation).toBeHidden()
        await expect(opener).toBeFocused()
        await openMenu()
        await drawer.getByRole('button', { name: 'Log out', exact: true }).click()
        mode = 'logout-error'
        await confirmation.getByRole('button', { name: 'Yes, log out', exact: true }).click()
        await expect(page.getByRole('alert').filter({ hasText: 'This browser is logged out' })).toBeVisible()
        // The existing SDK clears local Auth even when provider revocation fails.
        await page.evaluate(
          (session) => localStorage.setItem('rollcall.auth', JSON.stringify(session)),
          session,
        )
        mode = 'normal'
        username = null
        displayName = 'A very long public player name that needs truncation in the navigation'
        await page.goto(origin + '/about')
        await openMenu()
        await expect(drawer.getByRole('link', { name: 'My Profile', exact: true })).toHaveText(displayName)
        await overflow()
        // Verify theme and account controls remain reachable in landscape/large-text layouts.
        await page.setViewportSize({ width: 768, height: 320 })
        await page.addStyleTag({ content: 'html { font-size: 24px; }' })
        await expect(drawer.getByRole('button', { name: /Switch to .* theme/ })).toBeEnabled()
        await drawer.getByRole('button', { name: /Switch to .* theme/ }).scrollIntoViewIfNeeded()
        await overflow()
        await page.keyboard.press('Escape')
        await expect(drawer).toBeHidden()
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(origin + '/about')
        await expect(page.getByText('Welcome, ' + displayName, { exact: true })).toBeVisible()
        await overflow()
        mode = 'identity-error'
        await page.reload()
        await expect(page.getByText(/^Welcome,/)).toHaveCount(0)
        mode = 'normal'
        username = 'SecondPlayer'
        displayName = 'Second player display name'
        viewer = other
        identityGate = new Promise((resolve) => {
          releaseIdentity = resolve
        })
        await page.evaluate(
          (session) => {
            localStorage.setItem('rollcall.auth', JSON.stringify(session))
            const channel = new BroadcastChannel('rollcall.auth')
            channel.postMessage({ event: 'SIGNED_IN', session })
            setTimeout(() => channel.close(), 100)
          },
          { ...session, user: { ...user, id: other } },
        )
        await expect(page.getByText(/^Welcome,/)).toHaveCount(0)
        assert.equal(await page.getByText('Welcome, ' + displayName, { exact: true }).count(), 0)
        releaseIdentity()
        await expect(page.getByText('Welcome, Second player display name', { exact: true })).toBeVisible()
        await page.setViewportSize({ width: 375, height: 650 })
        status = 'suspended'
        await page.goto(origin + '/about')
        await openMenu()
        await expect(drawer.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0)
        await expect(drawer.getByRole('link', { name: 'My Profile', exact: true })).toHaveText('My Profile')
        await drawer.getByRole('link', { name: 'Host an event', exact: true }).click()
        await expect(page.getByRole('heading', { name: 'Account suspended', level: 1 })).toBeVisible()
        status = 'active'
        admin = false
        await page.goto(origin + '/about')
        await openMenu()
        await expect(drawer.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0)
        await drawer.getByRole('button', { name: 'Log out', exact: true }).click()
        await confirmation.getByRole('button', { name: 'Yes, log out', exact: true }).click()
        await expect(confirmation).toBeHidden()
        await openMenu()
        await expect(drawer.getByRole('link', { name: 'Log in', exact: true })).toBeVisible()
        assert.equal(await drawer.getByRole('link', { name: /My Profile|My Events|Settings/ }).count(), 0)
        await expect(drawer.getByRole('link', { name: 'Log in', exact: true })).toHaveAttribute(
          'href',
          /returnTo=%2Fabout/,
        )
        await drawer.getByRole('link', { name: 'Log in', exact: true }).click()
        await expect(page).toHaveURL(/\/login\?returnTo=%2Fabout$/)
        await page.setViewportSize({ width: 1440, height: 900 })
        await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible()
        await expect(page.getByText(/^Welcome,/)).toHaveCount(0)
        assert.deepEqual(errors, [])
        await context.close()
      }
    } finally {
      await browser?.close()
      await server.close()
    }
  },
)
