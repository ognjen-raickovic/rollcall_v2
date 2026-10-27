import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

test(
  'centered auth pages, callback/recovery states and case-preserving registration',
  { timeout: 120000 },
  async () => {
    const server = await createServer({
      root: fileURLToPath(new URL('..', import.meta.url)),
      cacheDir: fileURLToPath(new URL('../.tmp/auth-experience-cache', import.meta.url)),
      server: { host: '127.0.0.1', port: 0 },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic-auth.supabase.co'),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_synthetic_auth'),
        'import.meta.env.VITE_API_ORIGIN': JSON.stringify(''),
        'import.meta.env.VITE_ENABLE_DEMO_MODE': JSON.stringify('false'),
      },
    })
    await server.listen()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    const id = '10000000-0000-4000-8000-000000000001',
      email = 'fixture@example.test'
    const user = {
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
    const profile = {
      id,
      username: 'Ognjen3211',
      displayName: 'Ognjen3211',
      biography: null,
      country: null,
      city: null,
      createdAt: user.created_at,
      updatedAt: user.created_at,
      gameExperience: [],
    }
    let browser
    try {
      browser = await chromium.launch({
        headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      })
      const page = await browser.newPage(),
        errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (
          message.type() === 'error' &&
          !/Failed to load resource:.*status of (400|409)/.test(message.text())
        )
          errors.push(message.text())
      })
      let intentBody,
        signupBody,
        intentMode = 'duplicate',
        releaseIntent,
        releaseCode,
        codeMode = 'pending',
        loginCode = 'email_not_confirmed'
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url()),
          path = url.pathname
        const json = (body, status = 200) =>
          route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
        if (path === '/api/auth/registration-intent') {
          intentBody = route.request().postDataJSON()
          if (intentMode === 'pending') await new Promise((resolve) => (releaseIntent = resolve))
          return intentMode === 'duplicate'
            ? json(
                {
                  code: 'CONFLICT',
                  message: 'Choose another username.',
                  fields: { username: ['This username is unavailable. Choose another.'] },
                },
                409,
              )
            : json({ token: '20000000-0000-4000-8000-000000000001' })
        }
        if (path === '/auth/v1/signup') {
          signupBody = route.request().postDataJSON()
          return json({ user, session: null })
        }
        if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
          if (codeMode === 'pending') await new Promise((resolve) => (releaseCode = resolve))
          if (codeMode === 'failure')
            return json(
              {
                code: 'flow_state_not_found',
                error_code: 'flow_state_not_found',
                message: 'PRIVATE EXPIRED LINK DETAIL',
              },
              400,
            )
          return json(session)
        }
        if (path === '/auth/v1/token')
          return json({ code: loginCode, error_code: loginCode, message: 'PRIVATE UPSTREAM TEXT' }, 400)
        if (path === '/auth/v1/recover' || path === '/auth/v1/resend') return json({})
        if (path === '/auth/v1/user') return json(route.request().method() === 'PUT' ? { ...user } : user)
        if (path === '/auth/v1/logout') return route.fulfill({ status: 204 })
        if (path === '/api/me/account-status') return json({ status: 'active' })
        if (path === '/api/me/permissions')
          return json({ role: 'user', capabilities: { accessAdmin: false, manageAdminRoles: false } })
        if (path === '/api/me') return json({ id, email })
        if (path === '/api/me/profile')
          return json({ ...profile, birthYear: 2000, hasDateOfBirth: true, ageDeclaredAt: user.created_at })
        if (path.startsWith('/api/users/')) return json({ ...profile, email, dateOfBirth: '2000-02-29' })
        if (path.startsWith('/api/')) return json({ items: [], nextCursor: null })
        if (url.origin !== origin) return json({}, 503)
        return route.continue()
      })
      await mkdir(new URL('../.tmp/auth-experience/', import.meta.url), { recursive: true })
      const main = page.locator('main'),
        card = page.getByRole('region', { name: 'Account access', exact: true })
      const routes = [
        ['register', 'Create your account'],
        ['login', 'Welcome back'],
        ['auth/callback', 'Unable to confirm'],
        ['forgot-password', 'Reset your password'],
        ['reset-password', 'Choose a new password'],
      ]
      for (const width of [375, 1440])
        for (const theme of ['dark', 'light'])
          for (const [path, title] of routes) {
            await page.setViewportSize({ width, height: 900 })
            await page.goto(origin + '/' + path)
            await main.getByRole('heading', { name: title, exact: true }).waitFor()
            await page.evaluate((theme) => {
              document.documentElement.dataset.theme = theme
              document.documentElement.classList.toggle('dark', theme === 'dark')
            }, theme)
            const box = await card.boundingBox(),
              heading = await main.getByRole('heading', { name: title, exact: true }).boundingBox()
            assert.ok(box.width <= 480 && Math.abs(box.x + box.width / 2 - width / 2) < 2)
            assert.ok(Math.abs(heading.x + heading.width / 2 - width / 2) < 2)
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
            assert.equal(
              (await main.textContent()).includes(
                'Discover local games and find your next table. Your email and date of birth stay private.',
              ),
              false,
            )
            if (path === 'register' || path === 'login')
              await expect(
                card.getByRole('button', {
                  name: path === 'register' ? 'Create account' : 'Log in',
                  exact: true,
                }),
              ).toBeEnabled()
            const labels = card.locator('label')
            if (await labels.count())
              assert.equal(await labels.first().evaluate((el) => getComputedStyle(el).textAlign), 'left')
            if ((width === 375 && theme === 'dark') || (width === 1440 && theme === 'light'))
              await page.screenshot({
                path: fileURLToPath(
                  new URL(
                    `../.tmp/auth-experience/${path.replaceAll('/', '-')}-${width}-${theme}.png`,
                    import.meta.url,
                  ),
                ),
                fullPage: true,
              })
          }
      await page.goto(origin + '/register')
      await page.getByRole('button', { name: 'Create account', exact: true }).click()
      assert.equal(await page.getByLabel('Username', { exact: true }).getAttribute('aria-invalid'), 'true')
      assert.equal(intentBody, undefined)
      await page.getByLabel('Username', { exact: true }).fill(' Ognjen3211 ')
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByLabel('Date of birth', { exact: true }).fill('2000-02-29')
      await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-123!')
      await page.getByLabel('Confirm password', { exact: true }).fill('Different-password-123!')
      await page.getByRole('button', { name: 'Create account', exact: true }).click()
      await page.getByText('Passwords must match.', { exact: true }).waitFor()
      await page.getByLabel('Confirm password', { exact: true }).fill('Synthetic-password-123!')
      await page.getByRole('button', { name: 'Create account', exact: true }).click()
      await page.getByText('This username is unavailable. Choose another.', { exact: true }).waitFor()
      assert.equal(intentBody.username, 'Ognjen3211')
      intentMode = 'pending'
      await page.getByRole('button', { name: 'Create account', exact: true }).click()
      await page.getByRole('button', { name: 'Creating account...', exact: true }).waitFor()
      assert.equal(
        await page.getByRole('button', { name: 'Creating account...', exact: true }).isDisabled(),
        true,
      )
      await expect.poll(() => typeof releaseIntent).toBe('function')
      intentMode = 'success'
      releaseIntent()
      await page.getByRole('heading', { name: 'Check your email', exact: true }).waitFor()
      assert.equal(JSON.stringify(signupBody).includes('2000-02-29'), false)
      await page.goto(origin + '/login')
      assert.equal(await page.getByRole('button', { name: 'Resend confirmation', exact: true }).count(), 0)
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-123!')
      await page.getByRole('button', { name: 'Log in', exact: true }).click()
      await page.getByRole('button', { name: 'Resend confirmation', exact: true }).waitFor()
      loginCode = 'invalid_credentials'
      await page.getByRole('button', { name: 'Log in', exact: true }).click()
      await page.getByText('Email or password is incorrect.', { exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Resend confirmation', exact: true }).count(), 0)
      assert.equal((await main.textContent()).includes('PRIVATE UPSTREAM TEXT'), false)
      await page.goto(origin + '/forgot-password')
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByRole('button', { name: 'Send reset link', exact: true }).click()
      await page.getByRole('status').filter({ hasText: 'If an account exists' }).waitFor()
      codeMode = 'failure'
      await page.evaluate(() =>
        localStorage.setItem('rollcall.auth-code-verifier', JSON.stringify('synthetic-expired-verifier')),
      )
      await page.goto(origin + '/auth/callback?code=synthetic-expired')
      await main.getByRole('heading', { name: 'Unable to confirm', exact: true }).waitFor()
      assert.equal(await main.getByRole('link', { name: 'Go to login', exact: true }).count(), 1)
      assert.equal((await main.textContent()).includes('PRIVATE EXPIRED LINK DETAIL'), false)
      // Exercise the installed SDK's existing PKCE URL handling with a synthetic exchange.
      codeMode = 'pending'
      await page.evaluate(() =>
        localStorage.setItem('rollcall.auth-code-verifier', JSON.stringify('synthetic-verifier')),
      )
      await page.goto(origin + '/auth/callback?code=synthetic-confirmation')
      await main.getByRole('heading', { name: 'Confirming your email', exact: true }).waitFor()
      await expect.poll(() => typeof releaseCode).toBe('function')
      codeMode = 'success'
      releaseCode()
      await main.getByRole('heading', { name: 'Email confirmed', exact: true }).waitFor()
      await page.getByRole('link', { name: 'Continue to your account', exact: true }).click()
      await main.getByText('@Ognjen3211', { exact: true }).waitFor()
      await page.goto(origin + '/profile')
      await main.getByText('@Ognjen3211', { exact: true }).waitFor()
      assert.equal((await main.textContent()).includes('2000-02-29'), false)
      await page.goto(origin + '/users/' + id)
      await main.getByText('@Ognjen3211', { exact: true }).waitFor()
      // Existing recovery marker, session and update flow are unchanged by presentation work.
      await page.evaluate(() => sessionStorage.setItem('rollcall.password-recovery', 'true'))
      await page.goto(origin + '/reset-password')
      await page.getByLabel('New password', { exact: true }).fill('Synthetic-new-password-123!')
      await page.getByLabel('Confirm password', { exact: true }).fill('Synthetic-new-password-123!')
      await page.getByRole('button', { name: 'Update password', exact: true }).click()
      await page.waitForURL('**/login?passwordUpdated=true')
      await page.getByText('Password updated. Log in with your new password.', { exact: true }).waitFor()
      await page.setViewportSize({ width: 375, height: 600 })
      await page.goto(origin + '/register')
      await page.getByLabel('Username', { exact: true }).focus()
      await page.keyboard.press('Tab')
      assert.equal(
        await page.getByLabel('Email', { exact: true }).evaluate((el) => el === document.activeElement),
        true,
      )
      await page.getByRole('button', { name: 'Create account', exact: true }).scrollIntoViewIfNeeded()
      assert.deepEqual(errors, [])
    } finally {
      await browser?.close()
      await server.close()
    }
  },
)
