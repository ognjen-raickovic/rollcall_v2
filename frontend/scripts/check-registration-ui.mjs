import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'

test(
  'registration layout/validation and contextual login resend work at mobile and desktop sizes',
  { timeout: 60000 },
  async () => {
    const server = await createServer({
      root: fileURLToPath(new URL('..', import.meta.url)),
      server: { host: '127.0.0.1', port: 0 },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic-registration.supabase.co'),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_synthetic_fixture'),
        'import.meta.env.VITE_ENABLE_DEMO_MODE': JSON.stringify('false'),
      },
    })
    await server.listen()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    let browser
    try {
      browser = await chromium.launch({
        headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      })
      await mkdir(new URL('../.tmp/registration-review/', import.meta.url), { recursive: true })
      const page = await browser.newPage()
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url())
        if (url.pathname === '/api/auth/registration-intent')
          return route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              code: 'CONFLICT',
              message: 'Choose another username.',
              fields: { username: ['This username is unavailable. Choose another.'] },
            }),
          })
        if (url.pathname.startsWith('/auth/v1/'))
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              code: 'email_not_confirmed',
              error_code: 'email_not_confirmed',
              message: 'Email not confirmed',
            }),
          })
        if (url.origin !== origin)
          return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
        return route.continue()
      })
      for (const width of [375, 1440])
        for (const theme of ['dark', 'light']) {
          await page.setViewportSize({ width, height: 1000 })
          await page.goto(origin + '/register')
          await page.evaluate((theme) => {
            localStorage.setItem('rollcall.theme', theme)
            document.documentElement.dataset.theme = theme
            document.documentElement.classList.toggle('dark', theme === 'dark')
          }, theme)
          await page.getByLabel('Username', { exact: true }).waitFor()
          assert.deepEqual(
            await page.locator('form input').evaluateAll((inputs) => inputs.map((input) => input.id)),
            [
              'register-username',
              'register-email',
              'register-date-of-birth',
              'register-password',
              'register-confirmation',
            ],
          )
          assert.equal(
            await page.getByText('Use 8–72 characters. Choose a unique password.', { exact: true }).count(),
            0,
          )
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
          await page.screenshot({
            path: fileURLToPath(
              new URL(`../.tmp/registration-review/register-${width}-${theme}.png`, import.meta.url),
            ),
            fullPage: true,
          })
        }
      await page.getByLabel('Username', { exact: true }).fill('fixture_user')
      await page.getByLabel('Email', { exact: true }).fill('fixture@example.test')
      await page.getByLabel('Date of birth', { exact: true }).fill('2000-02-29')
      await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-123!')
      await page.getByLabel('Confirm password', { exact: true }).fill('Synthetic-password-123!')
      await page.getByRole('button', { name: 'Create account', exact: true }).click()
      await page.getByText('This username is unavailable. Choose another.', { exact: true }).waitFor()
      await page.goto(origin + '/login')
      await page.getByLabel('Email', { exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Resend confirmation', exact: true }).count(), 0)
      await page.getByLabel('Email', { exact: true }).fill('fixture@example.test')
      await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-123!')
      await page.getByRole('button', { name: 'Log in', exact: true }).click()
      await page.getByRole('button', { name: 'Resend confirmation', exact: true }).waitFor()
      await page.goto(origin + '/auth/callback')
      await page.getByRole('heading', { name: 'Unable to confirm' }).waitFor()
    } finally {
      await browser?.close()
      await server.close()
    }
  },
)
