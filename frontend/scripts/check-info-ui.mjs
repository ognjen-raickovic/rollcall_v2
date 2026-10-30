import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

test(
  'public information pages, clean navigation, profile headings and shared primary Back buttons',
  { timeout: 120000 },
  async () => {
    const server = await createServer({
      root: fileURLToPath(new URL('..', import.meta.url)),
      cacheDir: fileURLToPath(new URL('../.tmp/info-vite', import.meta.url)),
      server: { host: '127.0.0.1', port: 0 },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic-info.supabase.co'),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_synthetic_info'),
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
      await mkdir(fileURLToPath(new URL('../.tmp/info-ui', import.meta.url)), { recursive: true })
      const id = '12000000-0000-4000-8000-000000000001'
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
        access_token: 'synthetic-info-access',
        refresh_token: 'synthetic-info-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }
      const profile = {
        id,
        displayName: 'Tabletop Player',
        biography: 'A welcoming table.',
        country: null,
        city: null,
        createdAt: user.created_at,
        updatedAt: user.created_at,
        gameExperience: [],
      }
      for (const width of [375, 1440])
        for (const theme of ['dark', 'light']) {
          const context = await browser.newContext({ viewport: { width, height: 1000 } })
          await context.addInitScript((theme) => localStorage.setItem('rollcall.theme', theme), theme)
          const page = await context.newPage(),
            errors = []
          page.on('pageerror', (error) => errors.push(error.message))
          page.on('console', (message) => {
            if (message.type() === 'error') errors.push(message.text())
          })
          let status = 'active'
          await page.route('**/*', (route) => {
            const url = new URL(route.request().url()),
              path = url.pathname,
              json = (body) =>
                route.fulfill({
                  status: 200,
                  contentType: 'application/json',
                  body: JSON.stringify(body),
                })
            if (path === '/auth/v1/user') return json(user)
            if (path === '/api/me') return json({ id, email: user.email })
            if (path === '/api/me/account-status') return json({ status })
            if (path === '/api/me/permissions')
              return json({
                role: 'user',
                capabilities: { accessAdmin: false, manageAdminRoles: false },
              })
            if (path === '/api/me/profile')
              return json({ ...profile, birthYear: null, ageDeclaredAt: null, hasDateOfBirth: false })
            if (path === '/api/me/game-experience') return json([])
            if (path.startsWith('/api/users/')) return json(profile)
            if (path === '/api/games' || path === '/api/countries' || path === '/api/cities') return json([])
            if (path === '/api/events') return json({ items: [], pageInfo: { limit: 12, nextCursor: null } })
            if (path.startsWith('/api/') || url.hostname.endsWith('.supabase.co')) return route.abort()
            return route.continue()
          })
          const overflow = async () =>
            assert.ok(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
              'no horizontal overflow',
            )
          const colors = (element) =>
            element.evaluate((el) => ({
              background: getComputedStyle(el).backgroundColor,
              color: getComputedStyle(el).color,
              borderRadius: getComputedStyle(el).borderRadius,
            }))
          const stable = async () =>
            page.addStyleTag({
              content: '*,*::before,*::after { transition: none !important; animation: none !important; }',
            })
          await page.goto(origin + '/')
          await expect(page.getByRole('button', { name: 'Find events', exact: true })).toBeVisible()
          await stable()
          const primary = await colors(page.getByRole('button', { name: 'Find events', exact: true }))
          const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true })
          assert.equal(await navigation.getByRole('link', { name: 'Discover', exact: true }).count(), 0)
          await expect(navigation.getByRole('link', { name: 'RollCall', exact: true })).toHaveAttribute(
            'href',
            '/',
          )
          async function siteNavigation() {
            await expect(page.getByRole('button', { name: 'Find events', exact: true })).toBeVisible()
            if (width < 1280) {
              await page.getByRole('button', { name: 'Open menu', exact: true }).click()
              return page.getByRole('dialog', { name: 'Menu', exact: true })
            }
            return navigation
          }
          const siteLinks = await siteNavigation()
          await expect(siteLinks.getByRole('link', { name: 'Explore events', exact: true })).toHaveAttribute(
            'href',
            '/events',
          )
          await expect(siteLinks.getByRole('link', { name: 'Host an event', exact: true })).toHaveAttribute(
            'href',
            '/events/new',
          )
          await expect(siteLinks.getByRole('link', { name: 'Log in', exact: true })).toBeVisible()
          await siteLinks.getByRole('link', { name: 'Host an event', exact: true }).click()
          await expect(page).toHaveURL(/\/login\?returnTo=%2Fevents%2Fnew$/)
          await stable()
          const authBack = page.getByRole('link', { name: 'Back to discovery', exact: true })
          const authBackPosition = await authBack.boundingBox()
          const checkBackPosition = async () => {
            const back = page.getByRole('link', { name: 'Back to discovery', exact: true })
            await expect(back).toHaveCount(1)
            const position = await back.boundingBox()
            assert.ok(position && authBackPosition, 'BackLink has visible geometry')
            assert.equal(position.x, authBackPosition.x, 'BackLink matches login horizontal position')
            assert.equal(position.y, authBackPosition.y, 'BackLink matches login vertical position')
            const content = page.locator('main h1').locator('..').locator('..')
            const bounds = await content.boundingBox()
            assert.ok(bounds && bounds.width <= 896, 'information content retains max-w-4xl')
            assert.equal(bounds.x + bounds.width / 2, width / 2, 'information content stays centered')
          }
          assert.deepEqual(await colors(authBack), primary)
          await authBack.focus()
          await expect(authBack).toBeFocused()
          assert.notEqual(await authBack.evaluate((el) => getComputedStyle(el).boxShadow), 'none')
          await authBack.press('Enter')
          await expect(page).toHaveURL(origin + '/')
          const footer = page.getByRole('navigation', { name: 'Footer navigation', exact: true })
          await footer.getByRole('link', { name: 'About Us', exact: true }).click()
          await expect(page.getByRole('heading', { name: 'About RollCall', level: 1 })).toBeVisible()
          await checkBackPosition()
          await expect(page.locator('main h1')).toHaveCount(1)
          await expect(footer.getByRole('link', { name: 'About Us', exact: true })).toHaveAttribute(
            'aria-current',
            'page',
          )
          await overflow()
          await page.screenshot({
            path: fileURLToPath(
              new URL('../.tmp/info-ui/about-' + width + '-' + theme + '.png', import.meta.url),
            ),
            fullPage: true,
            animations: 'disabled',
          })
          await footer.getByRole('link', { name: 'Contact', exact: true }).click()
          await expect(page.getByRole('heading', { name: 'Contact Us', level: 1 })).toBeVisible()
          await checkBackPosition()
          await expect(
            page.getByRole('link', { name: 'rollcallsupport@gmail.com', exact: true }),
          ).toHaveAttribute('href', 'mailto:rollcallsupport@gmail.com')
          assert.equal(await page.locator('main form').count(), 0)
          assert.equal(
            await page.getByText('Email support is not available yet.', { exact: false }).count(),
            0,
          )
          await expect(footer.getByRole('link', { name: 'Contact', exact: true })).toHaveAttribute(
            'aria-current',
            'page',
          )
          await stable()
          assert.deepEqual(
            await colors(page.getByRole('link', { name: 'Back to discovery', exact: true })),
            primary,
          )
          await overflow()
          await page.screenshot({
            path: fileURLToPath(
              new URL('../.tmp/info-ui/contact-' + width + '-' + theme + '.png', import.meta.url),
            ),
            fullPage: true,
            animations: 'disabled',
          })
          await page.goBack()
          await expect(page.getByRole('heading', { name: 'About RollCall', level: 1 })).toBeVisible()
          await page.goForward()
          await expect(page.getByRole('heading', { name: 'Contact Us', level: 1 })).toBeVisible()
          await page.reload()
          await expect(page.getByRole('heading', { name: 'Contact Us', level: 1 })).toBeVisible()
          await page.goto(origin + '/about')
          await expect(page.getByRole('heading', { name: 'About RollCall', level: 1 })).toBeVisible()
          await page.reload()
          await expect(page.getByRole('heading', { name: 'About RollCall', level: 1 })).toBeVisible()
          await navigation.getByRole('link', { name: 'RollCall', exact: true }).click()
          await expect(page).toHaveURL(origin + '/')
          await (await siteNavigation()).getByRole('link', { name: 'Explore events', exact: true }).click()
          await expect(
            page.getByRole('heading', { name: 'Find your next game night', level: 1 }),
          ).toBeVisible()
          await page.goto(origin + '/events/not-a-uuid')
          await expect(page.getByRole('heading', { name: 'Invalid event ID', level: 1 })).toBeVisible()
          await stable()
          assert.deepEqual(
            await colors(page.getByRole('link', { name: 'Back to events', exact: true })),
            primary,
          )
          await page.evaluate(
            (session) => localStorage.setItem('rollcall.auth', JSON.stringify(session)),
            session,
          )
          await page.goto(origin + '/profile')
          await expect(page.getByRole('heading', { name: 'My Profile', level: 1 })).toBeVisible()
          await expect(page.locator('main h1')).toHaveCount(1)
          await expect(page.getByRole('heading', { name: 'Tabletop Player', level: 2 })).toBeVisible()
          if (width < 1280) {
            await page.getByRole('button', { name: 'Open menu', exact: true }).click()
            await expect(
              page
                .getByRole('dialog', { name: 'Menu', exact: true })
                .getByRole('link', { name: 'My Profile', exact: true }),
            ).toBeVisible()
            await page.keyboard.press('Escape')
          } else {
            await page.getByRole('button', { name: 'Account menu', exact: true }).click()
            await expect(page.getByRole('menuitem', { name: 'My Profile', exact: true })).toBeVisible()
            await page.keyboard.press('Escape')
          }
          await overflow()
          await page.screenshot({
            path: fileURLToPath(
              new URL('../.tmp/info-ui/profile-' + width + '-' + theme + '.png', import.meta.url),
            ),
            fullPage: true,
            animations: 'disabled',
          })
          await page.getByRole('link', { name: 'Edit Profile', exact: true }).click()
          await expect(page.getByRole('heading', { name: 'Edit Profile', level: 1 })).toBeVisible()
          await stable()
          assert.deepEqual(
            await colors(page.getByRole('link', { name: 'Back to My Profile', exact: true })),
            primary,
          )
          await page.goto(origin + '/users/' + id)
          await expect(page.getByRole('heading', { name: 'Tabletop Player', level: 1 })).toBeVisible()
          await expect(page.locator('main h1')).toHaveCount(1)
          status = 'suspended'
          for (const [path, title] of [
            ['about', 'About RollCall'],
            ['contact', 'Contact Us'],
          ]) {
            await page.goto(origin + '/' + path)
            await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
          }
          await page.goto(origin + '/does-not-exist')
          await expect(page.getByRole('heading', { name: /not found/i })).not.toBeVisible() // suspension guard still applies to unrelated routes
          status = 'active'
          await page.evaluate(() => localStorage.removeItem('rollcall.auth'))
          await page.goto(origin + '/does-not-exist')
          await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible()
          assert.deepEqual(errors, [])
          await context.close()
        }
    } finally {
      await browser?.close()
      await server.close()
    }
  },
)
