import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { test, expect } from '@playwright/test'

const enabled = process.env.RUN_LOCAL_AUTH_UI === 'true'
test.use({ trace: 'off' }) // Real session headers and recovery links must not enter traces.
const mailOrigin = 'http://127.0.0.1:55324'

async function followEmail(page, request, email, subject) {
  let message
  await expect
    .poll(
      async () => {
        const response = await request.get(`${mailOrigin}/api/v1/messages`)
        const inbox = await response.json()
        message = inbox.messages.find(
          (item) => item.Subject.includes(subject) && item.To.some((to) => to.Address === email),
        )
        return Boolean(message)
      },
      { message: 'Local confirmation/recovery email arrives' },
    )
    .toBe(true)
  const response = await request.get(`${mailOrigin}/api/v1/message/${message.ID}`)
  const full = await response.json()
  const link = (full.HTML ?? '')
    .match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/i)?.[1]
    ?.replaceAll('&amp;', '&')
  if (!link || new URL(link).origin !== 'http://127.0.0.1:55321')
    throw new Error('Expected a local Supabase email link')
  // Do not log this single-use link or copy it into screenshots/reports.
  await page.goto(link)
}

async function credentials(page, email, password) {
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
}

async function removeTestAccount(email) {
  process.loadEnvFile(new URL('../../backend/.env', import.meta.url))
  const url = new URL(process.env.GEOGRAPHY_DATABASE_URL)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Local test database required')
  const require = createRequire(new URL('../../backend/package.json', import.meta.url))
  const { Client } = require('pg')
  const db = new Client({ connectionString: url.href })
  await db.connect()
  try {
    await db.query('delete from auth.users where email = $1', [email])
  } finally {
    await db.end()
  }
}

test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(
    (theme) => localStorage.setItem('rollcall.theme', theme),
    info.project.metadata.theme,
  )
})

test('local real account confirmation, restoration, recovery and demo identity separation', async ({
  page,
  request,
}, info) => {
  test.skip(!enabled, 'Set RUN_LOCAL_AUTH_UI=true with local Supabase, Mailpit and configured frontend.')
  test.setTimeout(120000)
  const email = `auth-ui-${randomUUID()}@example.test`
  const password = `Rc!${randomUUID()}aA7`
  const replacement = `Rc!${randomUUID()}aA8`
  const exceptions = []
  page.on('pageerror', (error) => exceptions.push(error.message))
  try {
    await page.goto('/register')
    await credentials(page, email, password)
    await page.getByLabel('Confirm password', { exact: true }).fill('different')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.getByText('Passwords must match.', { exact: true })).toBeVisible()
    await page.getByLabel('Confirm password', { exact: true }).fill(password)
    await page.screenshot({ path: info.outputPath('registration.png'), fullPage: true })
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Check your email', exact: true })).toBeVisible()
    await page.goto('/login')
    await credentials(page, email, password)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await expect(page.getByText(/Confirm your email before logging in/)).toBeVisible()
    await followEmail(page, request, email, 'Confirm')
    await expect(
      page.getByText('Your email is confirmed and you are logged in.', { exact: true }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Continue to your account' }).click()
    await expect(page.getByText('Account verified by RollCall.', { exact: true })).toBeVisible()
    const identity = await page.evaluate(async () => {
      const saved = JSON.parse(localStorage.getItem('rollcall.auth'))
      const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${saved.access_token}` } })
      return { status: response.status, identity: await response.json() }
    })
    expect(identity.status).toBe(200)
    expect(identity.identity.id).toMatch(/^[\da-f]{8}-[\da-f-]{27}$/i)
    expect(identity.identity.email).toBe(email)
    expect(await page.evaluate(() => sessionStorage.getItem('rollcall.demo-user-id'))).toBeNull()
    await page.reload()
    await expect(page.getByText('Account verified by RollCall.', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('verified-account.png'), fullPage: true })
    await page.goto('/demo/events/new')
    await expect(
      page.getByRole('heading', { name: 'Event hosting is still a demo', exact: true }),
    ).toBeVisible()
    await expect(page.locator('#event-title')).toHaveCount(0)
    await page.goto('/demo/events/1')
    await expect(page.getByRole('button', { name: 'Demo attendance unavailable' })).toBeDisabled()
    await expect(page.getByText('18 Bokeska Street', { exact: true })).toHaveCount(0)
    await page.goto('/account')
    await page.getByRole('button', { name: 'Log out', exact: true }).last().click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await credentials(page, email, 'wrong-password')
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await expect(page.getByText('Email or password is incorrect.', { exact: true })).toBeVisible()
    await page.goto('/register')
    await credentials(page, email, password)
    await page.getByLabel('Confirm password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    // Supabase may return a safe error or neutral confirmation for an existing account.
    await expect(
      page
        .getByRole('heading', { name: 'Check your email', exact: true })
        .or(page.getByRole('alert').filter({ hasText: 'This account could not be registered.' })),
    ).toBeVisible()
    await page.goto('/forgot-password')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Send reset link', exact: true }).click()
    await expect(page.getByText(/If an account exists for this address/)).toBeVisible()
    await followEmail(page, request, email, 'Reset')
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible()
    await page.getByLabel('New password', { exact: true }).fill(replacement)
    await page.getByLabel('Confirm password', { exact: true }).fill(replacement)
    await page.screenshot({ path: info.outputPath('password-recovery.png'), fullPage: true })
    await page.getByRole('button', { name: 'Update password', exact: true }).click()
    await expect(
      page.getByText('Password updated. Log in with your new password.', { exact: true }),
    ).toBeVisible()
    await credentials(page, email, replacement)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await expect(page).toHaveURL(/\/events$/)
    await expect(page.locator('#filter-location-country')).toBeEnabled()
    await page.locator('#filter-location-country').selectOption('RS')
    await page.locator('#filter-location-city').fill('Cacak')
    await expect(
      page
        .getByRole('listbox')
        .getByRole('option', { name: /^Čačak/ })
        .first(),
    ).toBeVisible()
    expect(exceptions).toEqual([])
  } finally {
    // Only the random test account is removed. This never resets application/geography data.
    await removeTestAccount(email)
  }
})

test('auth validation, invalid links and responsive forms', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/login')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByText('Enter a valid email address.', { exact: true })).toBeVisible()
  await expect(page.getByText('Enter your password.', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('login-validation.png'), fullPage: true })
  await page.goto('/reset-password')
  await expect(page.getByText(/Open a valid password reset link/)).toBeVisible()
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0)
  await page.goto('/auth/callback?error=access_denied&error_description=Expired')
  await expect(page.getByText(/This link could not start a session/)).toBeVisible()
  await page.goto('/register')
  await credentials(page, 'invalid', 'short')
  await page.getByLabel('Confirm password', { exact: true }).fill('short')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByText('Use at least 8 characters.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
