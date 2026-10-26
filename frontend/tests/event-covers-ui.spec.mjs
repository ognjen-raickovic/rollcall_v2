import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'

test.skip(
  process.env.RUN_LOCAL_EVENT_COVERS_UI !== 'true',
  'Requires explicitly enabled local Supabase Storage, API and frontend.',
)
test.use({ trace: 'off' }) // Signed URLs, passwords and bearer headers must not enter traces.

let db, host, outsider, games, png, webp
const accounts = [],
  events = []
const password = `Rc!${randomUUID()}aA7`
const prefix = `Cover UI ${randomUUID().slice(0, 8)}`
async function response(method, path, actor, body) {
  const options = {
    method,
    headers: {
      ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
      ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    signal: AbortSignal.timeout(20000),
  }
  if (body !== undefined) options.body = body instanceof FormData ? body : JSON.stringify(body)
  return fetch(`http://127.0.0.1:3001/api${path}`, options)
}
async function api(method, path, actor, body) {
  const result = await response(method, path, actor, body)
  expect(result.ok, 'Local fixture request must succeed; response credentials are never logged.').toBe(true)
  return result.status === 204 ? undefined : result.json()
}
async function account() {
  const email = `cover-ui-${randomUUID()}@example.test`
  accounts.push(email)
  const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth
  const result = await auth.signUp({ email, password })
  expect(Boolean(result.error)).toBe(false)
  const id = result.data.user?.id
  if (!id) throw new Error('Local test registration unavailable.')
  const hash = (await db.query('select confirmation_token from auth.users where id=$1', [id])).rows[0]
    ?.confirmation_token
  const confirmed = await auth.verifyOtp({ token_hash: hash, type: 'signup' })
  expect(Boolean(confirmed.error)).toBe(false)
  const token = confirmed.data.session?.access_token
  if (!token) throw new Error('Local test session unavailable.')
  return { id, token, email }
}
test.beforeAll(async () => {
  process.loadEnvFile(new URL('../../backend/.env', import.meta.url))
  for (const value of [
    process.env.SUPABASE_URL,
    process.env.GEOGRAPHY_DATABASE_URL,
    process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
  ])
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname))
      throw new Error('Local fixtures only.')
  const require = createRequire(new URL('../../backend/package.json', import.meta.url))
  const { Client } = require('pg'),
    sharp = require('sharp')
  db = new Client({ connectionString: process.env.GEOGRAPHY_DATABASE_URL, connectionTimeoutMillis: 5000 })
  await db.connect()
  host = await account()
  outsider = await account()
  games = await api('GET', '/games')
  png = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#875aca' } })
    .png()
    .toBuffer()
  webp = await sharp({ create: { width: 1800, height: 900, channels: 3, background: '#358b77' } })
    .webp()
    .toBuffer()
})
test.afterAll(async () => {
  if (!db) return
  try {
    for (const id of events) {
      const deleted = await response('DELETE', `/events/${id}`, host)
      if (![204, 404].includes(deleted.status)) throw new Error('Fixture event cleanup failed.')
      await api('POST', `/events/${id}/cover/cleanup`, host)
    }
    const files = await db.query(
      "select count(*)::int n from storage.objects where bucket_id='event-covers' and split_part(name,'/',1)=any($1::text[])",
      [events],
    )
    expect(files.rows[0].n, 'Fixture files must be removed through Storage APIs.').toBe(0)
    await db.query(
      "delete from private.event_cover_objects where event_id=any($1::uuid[]) and state='deleted'",
      [events],
    )
    await db.query('delete from auth.users where email=any($1::text[])', [accounts])
  } finally {
    await db.end()
  }
})
test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(
    (theme) => localStorage.setItem('rollcall.theme', theme),
    info.project.metadata.theme,
  )
})
async function login(page, actor, target) {
  await page.goto(`/login?returnTo=${encodeURIComponent(target)}`)
  await page.getByLabel('Email', { exact: true }).fill(actor.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${target}$`))
}
function errors(page) {
  const found = []
  page.on('pageerror', () => found.push('page error'))
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !/Failed to load resource:.*(?:net::ERR_FAILED|status of (?:400|401|403|404|409|413|503))/.test(
        message.text(),
      )
    )
      found.push('unexpected console error')
  })
  return found
}
async function fillForm(page, title, visibility = 'public') {
  await page.locator('#event-title').fill(title)
  await page
    .locator('#event-description')
    .fill('A real local table for verifying persistent event cover image workflows.')
  await page.locator('#event-gameId').selectOption(String(games[0].id))
  await page.locator('#event-location-country').selectOption('ME')
  await page.locator('#event-location-city').fill('Podgorica')
  await page.getByRole('listbox').getByRole('option').first().click()
  await page.locator('#event-address').fill('Synthetic cover verification address')
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  await page.locator('#event-startsAt').fill(`${date}T18:30`)
  await page.locator('#event-endsAt').fill(`${date}T21:00`)
  await page.locator('#event-capacity').fill('4')
  await page.locator('#event-visibility').selectOption(visibility)
}
async function select(page, buffer = png, type = 'image/png', name = 'cover.png') {
  await page.getByLabel('Event cover image', { exact: true }).setInputFiles({ name, mimeType: type, buffer })
  await expect(
    page.getByText('Custom cover selected. Choose another file to replace it.', { exact: true }),
  ).toBeVisible()
}
async function create(page, title, visibility = 'public') {
  await page.goto('/events/new')
  await fillForm(page, title, visibility)
  await select(page)
  const created = page.waitForResponse(
    (result) =>
      new URL(result.url()).pathname === '/api/events' &&
      result.request().method() === 'POST' &&
      result.status() === 201,
  )
  await page.getByRole('button', { name: 'Create Event', exact: true }).click()
  const data = await (await created).json()
  events.push(data.id)
  await expect(page).toHaveURL(new RegExp(`/events/${data.id}$`))
  return data.id
}
function coverImage(page, title) {
  return page.getByRole('img', { name: `Event cover for ${title}`, exact: true })
}
async function expectCover(page, title, custom = true) {
  const image = coverImage(page, title)
  await expect(image).toBeVisible()
  await expect
    .poll(() =>
      image.evaluate(
        (element, expected) =>
          element.complete &&
          element.naturalWidth > 0 &&
          element.src.includes('/storage/v1/object/sign/event-covers/') === expected,
        custom,
      ),
    )
    .toBe(true)
}
async function capture(page, path) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path, fullPage: true })
}
async function deleteEvent(page) {
  await page.getByRole('button', { name: /^Delete Event$/i }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Delete Event$/i })
    .click()
  await expect(page).toHaveURL(/\/events$/)
}

test('real covers persist, display, replace, remove and enforce private access', async ({
  page,
  browser,
}, info) => {
  const found = errors(page)
  await login(page, host, '/events/new')
  const title = `${prefix} public`
  const id = await create(page, title)
  await expectCover(page, title)
  const first = await api('GET', `/events/${id}`, host)
  expect(first.cover.kind).toBe('custom')
  await capture(page, info.outputPath('custom-details.png'))
  await page.reload()
  await expectCover(page, title)
  await page.goto('/events')
  await page.locator('#event-search').fill(title)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expectCover(page, title)
  await page.goto('/')
  await expectCover(page, title)
  await page.goto(`/events/${id}/edit`)
  await expect(
    page.getByText('Custom cover selected. Choose another file to replace it.', { exact: true }),
  ).toBeVisible()
  await select(page, webp, 'image/webp', 'replacement.webp')
  await capture(page, info.outputPath('replace-form.png'))
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/events/${id}$`))
  await expectCover(page, title)
  const second = await api('GET', `/events/${id}`, host)
  expect(second.cover.version !== first.cover.version).toBe(true)
  expect(
    (
      await db.query('select count(*)::int n from storage.objects where bucket_id=$1 and name=$2', [
        'event-covers',
        `${id}/${first.cover.version}.webp`,
      ])
    ).rows[0].n,
  ).toBe(0)
  await page.goto(`/events/${id}/edit`)
  await page.getByRole('button', { name: 'Remove custom cover', exact: true }).click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/events/${id}$`))
  await expectCover(page, title, false)
  expect((await api('GET', `/events/${id}`, host)).cover.kind).toBe('default')
  await deleteEvent(page)

  const privateTitle = `${prefix} private`
  const privateId = await create(page, privateTitle, 'private')
  await expectCover(page, privateTitle)
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5173',
    viewport: info.project.use.viewport,
  })
  const otherPage = await context.newPage()
  try {
    await login(otherPage, outsider, `/events/${privateId}`)
    await expect(otherPage.getByRole('heading', { name: 'Event not found' })).toBeVisible()
    expect(await otherPage.locator('img[src*="/storage/v1/object/sign/"]').count()).toBe(0)
    expect((await response('GET', `/events/${privateId}/cover-url`, outsider)).status).toBe(404)
  } finally {
    await context.close()
  }
  await page.bringToFront()
  await deleteEvent(page)
  expect(
    (
      await db.query(
        "select count(*)::int n from storage.objects where bucket_id='event-covers' and split_part(name,'/',1)=any($1::text[])",
        [[id, privateId]],
      )
    ).rows[0].n,
  ).toBe(0)
  expect(found).toEqual([])
})

test('failed staged upload retries one saved event and signed access refreshes safely', async ({
  page,
}, info) => {
  test.skip(info.project.name !== '1440-dark', 'Focused failure, expiry and account-switch checks run once.')
  const found = errors(page)
  await login(page, host, '/events/new')
  const title = `${prefix} retry`
  await fillForm(page, title)
  await page
    .getByLabel('Event cover image', { exact: true })
    .setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await expect(page.getByText('Choose a JPG, PNG, or WebP image.', { exact: true })).toBeVisible()
  await select(page)
  await page.route('**/api/events/*/cover', (route) => route.abort('failed'))
  const created = page.waitForResponse(
    (result) =>
      new URL(result.url()).pathname === '/api/events' &&
      result.request().method() === 'POST' &&
      result.status() === 201,
  )
  await page.getByRole('button', { name: 'Create Event', exact: true }).click()
  const saved = await (await created).json()
  events.push(saved.id)
  await expect(page.getByRole('button', { name: 'Retry cover', exact: true })).toBeVisible()
  await expect(page.locator('#event-title')).toHaveValue(title)
  expect(
    (await db.query('select count(*)::int n from public.events where title=$1', [title])).rows[0].n,
  ).toBe(1)
  await page.unroute('**/api/events/*/cover')
  await page.getByRole('button', { name: 'Retry cover', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/events/${saved.id}$`))
  await expectCover(page, title)
  expect(
    (await db.query('select count(*)::int n from public.events where title=$1', [title])).rows[0].n,
  ).toBe(1)
  // Observe a second real signed request after the active query's 45-second refresh.
  await page.bringToFront()
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible')
  let signedReads = 0
  page.on('response', (result) => {
    if (new URL(result.url()).pathname === `/api/events/${saved.id}/cover-url` && result.status() === 200)
      signedReads += 1
  })
  await expect.poll(() => signedReads, { timeout: 55000, intervals: [500, 1000] }).toBeGreaterThan(0)
  await expectCover(page, title)
  await api('POST', `/events/${saved.id}/attendees/me`, outsider)
  await api('PATCH', `/events/${saved.id}`, host, { visibility: 'private' })
  await page.reload()
  await expectCover(page, title)
  expect(
    await page.evaluate(
      async ({ email, password }) => {
        const { authClient } = await import('/src/features/users/api/auth-client.ts')
        return Boolean((await authClient().auth.signInWithPassword({ email, password })).error)
      },
      { email: outsider.email, password },
    ),
  ).toBe(false)
  await expect(page.getByRole('button', { name: /^Leave Event$/i })).toBeEnabled()
  await expectCover(page, title)
  await page.getByRole('button', { name: /^Leave Event$/i }).click()
  await expect(page).toHaveURL(/\/events$/)
  expect(await page.locator('img[src*="/storage/v1/object/sign/"]').count()).toBe(0)
  expect((await response('GET', `/events/${saved.id}/cover-url`, outsider)).status).toBe(404)
  expect(
    await page.evaluate(
      async ({ email, password }) => {
        const { authClient } = await import('/src/features/users/api/auth-client.ts')
        return Boolean((await authClient().auth.signInWithPassword({ email, password })).error)
      },
      { email: host.email, password },
    ),
  ).toBe(false)
  await page.goto(`/events/${saved.id}`)
  await expectCover(page, title)
  let release, held
  const waiting = new Promise((resolve) => {
    held = resolve
  })
  const released = new Promise((resolve) => {
    release = resolve
  })
  await page.route(`**/api/events/${saved.id}/cover-url`, async (route) => {
    const result = await route.fetch()
    held()
    await released
    await route.fulfill({ response: result }).catch(() => {})
  })
  await page.goto(`/events/${saved.id}/edit`)
  await waiting
  expect(
    await page.evaluate(
      async ({ email, password }) => {
        const { authClient } = await import('/src/features/users/api/auth-client.ts')
        return Boolean((await authClient().auth.signInWithPassword({ email, password })).error)
      },
      { email: outsider.email, password },
    ),
  ).toBe(false)
  release()
  await page.unroute(`**/api/events/${saved.id}/cover-url`)
  await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible()
  expect(await page.locator('img[src*="/storage/v1/object/sign/"]').count()).toBe(0)
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  expect(await page.locator('img[src*="/storage/v1/object/sign/"]').count()).toBe(0)
  expect(found).toEqual([])
})
