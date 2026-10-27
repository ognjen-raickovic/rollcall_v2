import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'

const enabled = process.env.RUN_LOCAL_PROFILE_UI === 'true'
test.skip(!enabled, 'Set RUN_LOCAL_PROFILE_UI=true with local Supabase, Mailpit and Fastify.')
test.use({ trace: 'off' }) // Auth headers and one-use email links must not enter traces.

async function database() {
  process.loadEnvFile(new URL('../../backend/.env', import.meta.url))
  const origin = new URL(process.env.SUPABASE_URL)
  const url = new URL(process.env.GEOGRAPHY_DATABASE_URL)
  if (![origin.hostname, url.hostname].every((host) => ['localhost', '127.0.0.1', '[::1]'].includes(host)))
    throw new Error('Profile browser fixtures require local services.')
  const require = createRequire(new URL('../../backend/package.json', import.meta.url))
  const { Client } = require('pg')
  const db = new Client({ connectionString: url.href })
  await db.connect()
  return db
}

async function cleanup(emails) {
  const db = await database()
  try {
    await db.query('delete from auth.users where email = any($1::text[])', [emails])
  } finally {
    await db.end()
  }
}

async function confirmedAccount(email, password) {
  const db = await database()
  const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth
  try {
    const registered = await auth.signUp({ email, password })
    expect(Boolean(registered.error)).toBe(false)
    const userId = registered.data.user?.id
    if (!userId) throw new Error('Local test registration did not create an account.')
    const result = await db.query('select confirmation_token from auth.users where id=$1', [userId])
    const confirmed = await auth.verifyOtp({ token_hash: result.rows[0].confirmation_token, type: 'signup' })
    expect(Boolean(confirmed.error)).toBe(false)
    if (!confirmed.data.session) throw new Error('Local test confirmation did not create a session.')
    return { id: userId, token: confirmed.data.session.access_token }
  } finally {
    await db.end()
  }
}

async function confirmEmail(page, request, email) {
  let item
  await expect
    .poll(
      async () => {
        const inbox = await (await request.get('http://127.0.0.1:55324/api/v1/messages')).json()
        item = inbox.messages.find(
          (message) => message.Subject.includes('Confirm') && message.To.some((to) => to.Address === email),
        )
        return Boolean(item)
      },
      { message: 'Local confirmation email arrives' },
    )
    .toBe(true)
  const message = await (await request.get(`http://127.0.0.1:55324/api/v1/message/${item.ID}`)).json()
  const link = message.HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/i)?.[1]?.replaceAll('&amp;', '&')
  if (!link || new URL(link).origin !== 'http://127.0.0.1:55321')
    throw new Error('Expected a local confirmation link.')
  await page.goto(link)
  await expect(
    page.getByText('Your email is confirmed and you are logged in.', { exact: true }),
  ).toBeVisible()
}

async function login(page, email, password) {
  await page.goto('/login?returnTo=%2Fprofile')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
}

async function chooseCity(page, query, name) {
  const input = page.locator('#profile-location-city')
  await input.fill(query)
  const option = page
    .getByRole('listbox')
    .getByRole('option', { name: new RegExp(`^${name}(?:\\s|$)`) })
    .first()
  await expect(option).toBeVisible()
  await option.click()
  await expect(input).toHaveValue(name)
}

test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(
    (theme) => localStorage.setItem('rollcall.theme', theme),
    info.project.metadata.theme,
  )
})

test('real profile persistence, optional location, private age and independent game experience', async ({
  page,
  request,
}, info) => {
  const email = `profile-ui-${randomUUID()}@example.test`
  const otherEmail = `profile-ui-${randomUUID()}@example.test`
  const password = `Rc!${randomUUID()}aA7`
  const exceptions = []
  page.on('pageerror', (error) => exceptions.push(error.message))
  try {
    await page.goto('/register')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Check your email', exact: true })).toBeVisible()
    await confirmEmail(page, request, email)
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Make yourself at home' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'RollCall player', exact: true })).toBeVisible()
    const publicPath = await page.getByRole('link', { name: 'View public profile' }).getAttribute('href')
    await page.getByRole('link', { name: 'Edit profile', exact: true }).click()
    await expect(page.locator('#profile-location-country')).toBeEnabled()
    await page.getByLabel('Display name', { exact: false }).fill('A')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByText('Use at least 2 characters.', { exact: true })).toBeVisible()
    await page.getByLabel('Display name', { exact: false }).fill('Mila the Storyteller')
    await page
      .getByLabel('Biography', { exact: true })
      .fill('I enjoy welcoming new players and building stories together.')
    await page.getByLabel('Birth year (private)', { exact: true }).selectOption('1988')
    await page.locator('#profile-location-country').selectOption('ME')
    await page.locator('#profile-location-city').fill('Podgorica')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(
      page.getByText('Choose a city suggestion or clear the city field.', { exact: true }),
    ).toBeVisible()
    await chooseCity(page, 'Podgorica', 'Podgorica')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('profile-editor.png'), fullPage: true })
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByText('Your profile has been saved.', { exact: true })).toBeVisible()
    await expect(page.getByText('Podgorica, Montenegro', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Birth year: 1988. Self-declared; not verified.', { exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Mila the Storyteller', exact: true })).toBeVisible()
    await expect(
      page.getByText('Birth year: 1988. Self-declared; not verified.', { exact: true }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Edit profile', exact: true }).click()
    await page.locator('#profile-location-country').selectOption('RS')
    await expect(page.locator('#profile-location-city')).toHaveValue('')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByText('Serbia', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Edit profile', exact: true }).click()
    await chooseCity(page, 'Cacak', 'Čačak')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByText('Čačak, Serbia', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Edit profile', exact: true }).click()
    await page.getByRole('tab', { name: 'My games', exact: true }).click()
    const game = page.getByLabel('Game', { exact: true })
    await game.selectOption({ label: 'Dungeons & Dragons' })
    await page.getByLabel('Experience', { exact: true }).selectOption('veteran')
    await page.getByRole('button', { name: 'Add game', exact: true }).click()
    await expect(page.getByText('Game added to your profile.', { exact: true })).toBeVisible()
    await expect(game.locator('option', { hasText: 'Dungeons & Dragons' })).toHaveCount(0)
    await game.selectOption({ label: 'Magic: The Gathering' })
    await page.getByLabel('Experience', { exact: true }).selectOption('beginner')
    await page.getByRole('button', { name: 'Add game', exact: true }).click()
    await expect(page.getByLabel('Experience for Magic: The Gathering', { exact: true })).toHaveValue(
      'beginner',
    )
    await page.getByLabel('Experience for Dungeons & Dragons', { exact: true }).selectOption('intermediate')
    await page.getByRole('button', { name: 'Save experience for Dungeons & Dragons', exact: true }).click()
    await expect(page.getByText('Experience updated.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Remove Magic: The Gathering', exact: true }).click()
    await expect(page.getByText('Game removed from your profile.', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Experience for Dungeons & Dragons', { exact: true })).toHaveValue(
      'intermediate',
    )
    await expect(page.getByLabel('Experience for Magic: The Gathering', { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('profile-games.png'), fullPage: true })
    await page.goto(publicPath)
    await expect(page.getByRole('heading', { name: 'Mila the Storyteller', exact: true })).toBeVisible()
    await expect(page.getByText('intermediate', { exact: true })).toBeVisible()
    await expect(page.locator('main')).not.toContainText(email)
    await expect(page.locator('main')).not.toContainText('1988')
    await expect(page.getByRole('heading', { name: 'Only visible to you' })).toHaveCount(0)
    const publicResponse = await request.get(`/api${publicPath}`)
    expect(publicResponse.status()).toBe(200)
    const publicData = await publicResponse.json()
    for (const key of ['email', 'birthYear', 'ageDeclaredAt', 'role'])
      expect(Object.hasOwn(publicData, key)).toBe(false)
    const other = await confirmedAccount(otherEmail, password)
    const otherSaved = await request.patch('/api/me/profile', {
      headers: { Authorization: `Bearer ${other.token}` },
      data: { displayName: 'Another tabletop player', birthYear: 1977 },
    })
    expect(otherSaved.status()).toBe(200)
    await page.goto(`/users/${other.id}`)
    await expect(page.getByRole('heading', { name: 'Another tabletop player', exact: true })).toBeVisible()
    await expect(page.locator('main')).not.toContainText('1977')
    await expect(page.locator('main')).not.toContainText(otherEmail)
    await page.getByRole('button', { name: 'Log out', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Another tabletop player', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('public-profile.png'), fullPage: true })
    await page.goto('/profile/edit')
    await expect(page).toHaveURL(/\/login\?returnTo=/)
    expect(exceptions).toEqual([])
  } finally {
    await cleanup([email, otherEmail])
  }
})

test('profile loading, retry, empty catalog and missing public profile', async ({ page, request }, info) => {
  const email = `profile-ui-${randomUUID()}@example.test`
  const password = `Rc!${randomUUID()}aA7`
  const exceptions = []
  page.on('pageerror', (error) => exceptions.push(error.message))
  try {
    await confirmedAccount(email, password)
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    await page.route('**/api/me/profile', async (route) => {
      await gate
      await route.continue()
    })
    await login(page, email, password)
    await expect(page.getByRole('status', { name: 'Loading your profile' })).toBeVisible()
    release()
    await expect(page.getByRole('heading', { name: 'Make yourself at home' })).toBeVisible()
    await page.unroute('**/api/me/profile')
    await page.route('**/api/me/profile', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Test outage', fields: {} }),
      }),
    )
    await page.reload()
    await expect(page.getByRole('button', { name: 'Retry profile', exact: true })).toBeVisible()
    await page.unroute('**/api/me/profile')
    await page.getByRole('button', { name: 'Retry profile', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Make yourself at home' })).toBeVisible()
    await page.route('**/api/games', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )
    await page.getByRole('link', { name: 'Edit profile', exact: true }).click()
    await page.getByRole('tab', { name: 'My games', exact: true }).click()
    await expect(page.getByText('No games are available in the catalog yet.', { exact: true })).toBeVisible()
    await expect(page.getByText(/No games added yet. Add a favorite/)).toBeVisible()
    await page.getByRole('tab', { name: 'Profile', exact: true }).click()
    await page.getByLabel('Display name', { exact: false }).fill('Retry player')
    await page.route('**/api/me/profile', async (route) => {
      if (route.request().method() === 'PATCH')
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      else await route.continue()
    })
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(
      page.getByRole('alert').filter({ hasText: 'Your changes are still in the form.' }),
    ).toBeVisible()
    await expect(page.getByLabel('Display name', { exact: false })).toHaveValue('Retry player')
    await page.screenshot({ path: info.outputPath('profile-error.png'), fullPage: true })
    await page.unroute('**/api/me/profile')
    await page.unroute('**/api/games')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Retry player', exact: true })).toBeVisible()
    await page.goto(`/users/${randomUUID()}`)
    await expect(page.getByRole('heading', { name: 'Player not found', exact: true })).toBeVisible()
    expect((await request.patch('/api/me/profile', { data: { displayName: 'Unauthorized' } })).status()).toBe(
      401,
    )
    expect(exceptions).toEqual([])
  } finally {
    await cleanup([email])
  }
})
