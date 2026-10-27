import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'

test(
  'account pages preserve privacy, identity, guards and accessible logout confirmation',
  { timeout: 90000 },
  async () => {
    const server = await createServer({
      root: fileURLToPath(new URL('..', import.meta.url)),
      cacheDir: fileURLToPath(new URL('../.tmp/account-vite-cache', import.meta.url)),
      server: { host: '127.0.0.1', port: 0 },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic-account.supabase.co'),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_synthetic_account'),
        'import.meta.env.VITE_API_ORIGIN': JSON.stringify(''),
        'import.meta.env.VITE_ENABLE_DEMO_MODE': JSON.stringify('false'),
      },
    })
    await server.listen()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    const owner = '10000000-0000-4000-8000-000000000001',
      other = '10000000-0000-4000-8000-000000000002'
    const email = 'private-owner@example.test',
      dob = '1992-04-23'
    const user = {
      id: owner,
      email,
      aud: 'authenticated',
      role: 'authenticated',
      user_metadata: {},
      app_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    }
    const session = {
      user,
      access_token: 'synthetic-account-access',
      refresh_token: 'synthetic-account-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    }
    const profile = {
      id: owner,
      displayName: 'Mira Player',
      biography: 'Finding good company around the table.',
      country: { id: 1, isoCode: 'ME', name: 'Montenegro' },
      city: null,
      createdAt: user.created_at,
      updatedAt: user.created_at,
      gameExperience: [{ gameId: 1, gameName: 'Dungeons & Dragons', experience: 'veteran' }],
    }
    let browser
    try {
      browser = await chromium.launch({
        headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      })
      const context = await browser.newContext()
      await context.addInitScript(
        ({ session }) => {
          if (!sessionStorage.getItem('fixture-initialized')) {
            localStorage.setItem('rollcall.auth', JSON.stringify(session))
            sessionStorage.setItem('fixture-initialized', 'true')
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
          !/Failed to load resource:.*status of (500|503)/.test(message.text())
        )
          errors.push(message.text())
      })
      let state = 'active',
        profileMode = 'normal',
        logoutMode = 'fail',
        logoutCalls = 0,
        ownCalls = 0,
        releaseLogout,
        releaseProfile
      const fulfilled = (route, body, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url()),
          path = url.pathname
        if (path === '/auth/v1/logout') {
          logoutCalls++
          if (logoutMode === 'pending')
            await new Promise((resolve) => {
              releaseLogout = resolve
            })
          return logoutMode === 'fail'
            ? fulfilled(route, { code: 'unexpected_failure', message: 'PRIVATE UPSTREAM MESSAGE' }, 500)
            : route.fulfill({ status: 204 })
        }
        if (path === '/auth/v1/user') return fulfilled(route, user)
        if (path === '/api/me') return fulfilled(route, { id: owner, email })
        if (path === '/api/me/account-status') return fulfilled(route, { status: state })
        if (path === '/api/me/permissions')
          return fulfilled(route, {
            role: 'user',
            capabilities: { accessAdmin: false, manageAdminRoles: false },
          })
        if (path === '/api/me/profile') {
          ownCalls++
          return fulfilled(route, {
            ...profile,
            birthYear: 1992,
            hasDateOfBirth: true,
            ageDeclaredAt: user.created_at,
            dateOfBirth: dob,
          })
        }
        if (path.startsWith('/api/users/')) {
          if (profileMode === 'loading')
            await new Promise((resolve) => {
              releaseProfile = resolve
            })
          if (profileMode === 'error')
            return fulfilled(
              route,
              { code: 'DEPENDENCY_UNAVAILABLE', message: 'Profile unavailable.', fields: {} },
              503,
            )
          const result = path.endsWith(other)
            ? { ...profile, id: other, displayName: 'Another Player' }
            : profile
          // Adversarial extras must be dropped by the existing public projection.
          return fulfilled(route, {
            ...result,
            ...(profileMode === 'empty' ? { biography: null, gameExperience: [] } : {}),
            email,
            birthYear: 1992,
            dateOfBirth: dob,
            role: 'superadmin',
          })
        }
        if (path.startsWith('/api/')) return fulfilled(route, { items: [], nextCursor: null })
        if (url.origin !== origin) return fulfilled(route, {}, 503)
        return route.continue()
      })
      await mkdir(new URL('../.tmp/account-review/', import.meta.url), { recursive: true })
      const main = page.locator('main')
      for (const width of [375, 1440])
        for (const theme of ['dark', 'light']) {
          await page.setViewportSize({ width, height: 1000 })
          await page.goto(origin + '/account')
          await main.getByText('Private birth year', { exact: true }).waitFor()
          await page.evaluate((theme) => {
            document.documentElement.dataset.theme = theme
            document.documentElement.classList.toggle('dark', theme === 'dark')
            localStorage.setItem('rollcall.theme', theme)
          }, theme)
          assert.equal(await main.getByText(email, { exact: true }).count(), 1)
          assert.equal(await main.getByText(dob, { exact: true }).count(), 0)
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
          await page.screenshot({
            path: fileURLToPath(
              new URL(`../.tmp/account-review/settings-${width}-${theme}.png`, import.meta.url),
            ),
            fullPage: true,
          })
          const trigger = main.getByRole('button', { name: 'Log out', exact: true })
          await trigger.click()
          const dialog = page.getByRole('dialog', { name: 'Log out of RollCall?' })
          await dialog.waitFor()
          assert.equal(
            await dialog
              .getByRole('button', { name: 'No, stay', exact: true })
              .evaluate((el) => el === document.activeElement),
            true,
          )
          const buttons = dialog.getByRole('button')
          assert.deepEqual(await buttons.allTextContents(), ['Yes, log out', 'No, stay'])
          const yes = await buttons.nth(0).boundingBox(),
            no = await buttons.nth(1).boundingBox(),
            box = await dialog.boundingBox()
          assert.ok(
            yes.x < no.x && Math.abs(yes.y - no.y) < 2 && Math.abs(yes.width - no.width) < 2,
            JSON.stringify({ yes, no, box }),
          )
          assert.ok(Math.abs(box.x + box.width / 2 - width / 2) < 2)
          assert.equal(await dialog.evaluate((el) => getComputedStyle(el).textAlign), 'center')
          await page.keyboard.press('Tab')
          assert.equal(await dialog.evaluate((el) => el.contains(document.activeElement)), true)
          await page.keyboard.press('Shift+Tab')
          assert.equal(await dialog.evaluate((el) => el.contains(document.activeElement)), true)
          await page.screenshot({
            path: fileURLToPath(
              new URL(`../.tmp/account-review/logout-${width}-${theme}.png`, import.meta.url),
            ),
          })
          await page.keyboard.press('Escape')
          await dialog.waitFor({ state: 'detached' })
          assert.equal(await trigger.evaluate((el) => el === document.activeElement), true)
          await trigger.click()
          await dialog.getByRole('button', { name: 'No, stay', exact: true }).click()
          assert.equal(logoutCalls, 0)
        }
      // Own profile must use the same safe projection as the public route, never /me/profile.
      ownCalls = 0
      await page.goto(origin + '/profile')
      await main.getByRole('heading', { name: 'Mira Player', exact: true }).waitFor()
      assert.equal(ownCalls, 0)
      for (const value of [email, dob, '1992', 'superadmin'])
        assert.equal((await main.textContent()).includes(value), false)
      assert.equal(await main.getByRole('link', { name: 'Edit Profile', exact: true }).count(), 1)
      await page.goto(origin + '/users/' + owner)
      await main.getByRole('link', { name: 'Back to My Profile', exact: true }).waitFor()
      assert.equal(await main.getByRole('link', { name: 'Account Settings', exact: true }).count(), 1)
      await page.reload()
      await main.getByRole('link', { name: 'Back to My Profile', exact: true }).waitFor()
      await page.goto(origin + '/users/' + other)
      await main.getByRole('heading', { name: 'Another Player', exact: true }).waitFor()
      assert.equal(await main.getByRole('link', { name: 'Account Settings', exact: true }).count(), 0)
      assert.equal(await main.getByRole('link', { name: 'Back to My Profile', exact: true }).count(), 0)
      profileMode = 'empty'
      await page.reload()
      await main.getByText('No games added yet. Every great table starts somewhere.').waitFor()
      profileMode = 'error'
      await page.reload()
      await main.getByRole('button', { name: 'Retry profile' }).waitFor()
      profileMode = 'loading'
      await page.goto(origin + '/users/' + owner)
      await page.getByRole('status', { name: 'Loading player profile' }).waitFor()
      profileMode = 'normal'
      releaseProfile()
      await main.getByRole('heading', { name: 'Mira Player', exact: true }).waitFor()
      state = 'suspended'
      ownCalls = 0
      await page.goto(origin + '/account')
      await main.getByRole('heading', { name: 'Account suspended', exact: true }).waitFor()
      assert.equal(
        await main.getByRole('link', { name: 'Reset password', exact: true }).getAttribute('href'),
        '/forgot-password',
      )
      assert.equal(ownCalls, 0)
      await page.goto(origin + '/profile')
      await main.getByRole('heading', { name: 'Account suspended', exact: true }).waitFor()
      await main.getByRole('button', { name: 'Log out', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'No, stay', exact: true }).click()
      state = 'active'
      await page.goto(origin + '/account')
      await main.getByText('Private birth year', { exact: true }).waitFor()
      // The SDK clears its local session even when remote revocation fails.
      await page.getByRole('button', { name: 'Log out', exact: true }).first().click()
      let dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Yes, log out', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: 'This browser is logged out' }).waitFor()
      assert.equal((await main.textContent()).includes('PRIVATE UPSTREAM MESSAGE'), false)
      assert.equal(logoutCalls, 1)
      await page.getByRole('button', { name: 'Dismiss logout message', exact: true }).click()
      assert.equal(await page.getByRole('alert').filter({ hasText: 'This browser is logged out' }).count(), 0)
      // Restore only the synthetic fixture for the independent pending/success path.
      await page.evaluate(
        (session) => localStorage.setItem('rollcall.auth', JSON.stringify(session)),
        session,
      )
      await page.goto(origin + '/account')
      await main.getByText('Private birth year', { exact: true }).waitFor()
      logoutMode = 'pending'
      await main.getByRole('button', { name: 'Log out', exact: true }).click()
      dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Yes, log out', exact: true }).click()
      await dialog.getByRole('status').waitFor()
      assert.equal(await dialog.getByRole('button', { name: 'No, stay', exact: true }).isDisabled(), true)
      await page.keyboard.press('Escape')
      assert.equal(await dialog.isVisible(), true)
      await dialog
        .getByRole('button')
        .first()
        .evaluate((el) => {
          el.click()
          el.click()
        })
      assert.equal(logoutCalls, 2)
      logoutMode = 'success'
      releaseLogout()
      await page.waitForURL('**/login?returnTo=%2Faccount')
      assert.equal((await main.textContent()).includes(email), false)
      await page.goto(origin + '/account')
      await page.waitForURL('**/login?returnTo=%2Faccount')
      await page.goto(origin + '/users/' + owner)
      await main.getByRole('heading', { name: 'Mira Player', exact: true }).waitFor()
      assert.equal(await main.getByRole('link', { name: 'Account Settings', exact: true }).count(), 0)
      assert.deepEqual(errors, [])
      await context.close()
    } finally {
      await browser?.close()
      await server.close()
    }
  },
)
