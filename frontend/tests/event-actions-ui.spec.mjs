import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'

test.skip(
  process.env.RUN_LOCAL_EVENT_ACTIONS_UI !== 'true',
  'Requires explicitly enabled local Supabase, Fastify and Vite.',
)
test.use({ trace: 'off' }) // Never retain passwords, bearer headers or session storage in traces.

let db, host, player, third, catalog, city
const emails = []
const password = `Rc!${randomUUID()}aA7`
const prefix = `Actions-${randomUUID().slice(0, 8)}`
const address = 'Synthetic protected event actions address'

async function response(method, path, actor, body) {
  const options = {
    method,
    headers: {
      ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    signal: AbortSignal.timeout(10000),
  }
  if (body !== undefined) options.body = JSON.stringify(body)
  return fetch(`http://127.0.0.1:3001${path.startsWith('/events') ? `/api${path}` : path}`, options)
}
async function api(method, path, actor, body) {
  const result = await response(method, path, actor, body)
  expect(result.ok, 'Local fixture API must succeed; credentials are never logged.').toBe(true)
  return result.status === 204 ? undefined : result.json()
}
async function account(label) {
  const email = `event-actions-${label}-${randomUUID()}@example.test`
  emails.push(email)
  const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth
  const signup = await auth.signUp({ email, password })
  expect(Boolean(signup.error)).toBe(false)
  const id = signup.data.user?.id
  if (!id) throw new Error('Local test registration failed.')
  const hash = (await db.query('select confirmation_token from auth.users where id=$1', [id])).rows[0]
    ?.confirmation_token
  if (!hash) throw new Error('Local test confirmation is unavailable.')
  const confirmed = await auth.verifyOtp({ token_hash: hash, type: 'signup' })
  expect(Boolean(confirmed.error)).toBe(false)
  const token = confirmed.data.session?.access_token
  if (!token) throw new Error('Local test session is unavailable.')
  return { id, token, email }
}

test.beforeAll(async () => {
  process.loadEnvFile(new URL('../../backend/.env', import.meta.url))
  const origins = [
    process.env.SUPABASE_URL,
    process.env.GEOGRAPHY_DATABASE_URL,
    process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
  ]
  if (!origins.every((value) => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)))
    throw new Error('Event action fixtures require local services.')
  const require = createRequire(new URL('../../backend/package.json', import.meta.url))
  const { Client } = require('pg')
  db = new Client({ connectionString: process.env.GEOGRAPHY_DATABASE_URL, connectionTimeoutMillis: 5000 })
  await db.connect()
  host = await account('host')
  player = await account('participant')
  third = await account('capacity')
  await api('PATCH', '/api/me/profile', host, { displayName: 'Actions host' })
  catalog = await api('GET', '/api/games')
  city = (await api('GET', '/api/cities?country=ME&q=Podgorica'))[0]
  if (!catalog[0] || !city) throw new Error('Local catalogs are unavailable.')
})
test.afterAll(async () => {
  if (!db) return
  try {
    if (host) await db.query('delete from public.events where host_id=$1', [host.id])
    await db.query('delete from auth.users where email=any($1::text[])', [emails])
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
  await expect(page).toHaveURL(new RegExp(`${target.replaceAll('/', '\\/')}$`))
}
async function switchAccount(page, actor) {
  expect(
    await page.evaluate(
      async ({ email, password }) => {
        const { authClient } = await import('/src/features/users/api/auth-client.ts')
        return Boolean((await authClient().auth.signInWithPassword({ email, password })).error)
      },
      { email: actor.email, password },
    ),
  ).toBe(false)
}
async function refocus(page) {
  // Chromium may already consider this window focused. Exercise a complete
  // visibility transition so TanStack reliably refetches the active stale query.
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    try {
      for (const state of ['hidden', 'visible']) {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
        document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
      }
    } finally {
      if (original) Object.defineProperty(document, 'visibilityState', original)
      else delete document.visibilityState
    }
  })
}
function watchErrors(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !/Failed to load resource:.*(?:net::ERR_FAILED|status of (?:400|401|403|404|409|503))/.test(
        message.text(),
      )
    )
      errors.push(message.text())
  })
  return errors
}
async function chooseCity(page, country = 'ME', query = 'Podgorica') {
  await expect(page.locator('#event-location-country')).toBeEnabled()
  await page.locator('#event-location-country').selectOption(country)
  await page.locator('#event-location-city').fill(query)
  const option = page.getByRole('listbox').getByRole('option').first()
  await expect(option).toBeVisible()
  await option.click()
  await expect(page.locator('#event-location-city-error')).toHaveCount(0)
}
async function fillForm(page, title, visibility = 'public') {
  await page.locator('#event-title').fill(title)
  await page
    .locator('#event-description')
    .fill('A persistent game night created through the real RollCall frontend for local acceptance testing.')
  await page.locator('#event-gameId').selectOption(String(catalog[0].id))
  await chooseCity(page)
  await page.locator('#event-address').fill(address)
  const localStart = `${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}T18:30`
  const localEnd = `${localStart.slice(0, 10)}T21:00`
  await page.locator('#event-startsAt').fill(localStart)
  await page.locator('#event-endsAt').fill(localEnd)
  await page.locator('#event-capacity').fill('2')
  await page.locator('#event-minimumAge').fill('16')
  await page.locator('#event-price').fill('3.50')
  await page.locator('#event-visibility').selectOption(visibility)
  return { expectedStart: await page.evaluate((local) => new Date(local).toISOString(), localStart) }
}
async function fixture(overrides = {}) {
  return api('POST', '/api/events', host, {
    title: `${prefix} auxiliary ${randomUUID().slice(0, 5)}`,
    description: 'A synthetic persistent fixture for real action error and privacy checks.',
    gameId: catalog[0].id,
    cityId: city.id,
    address,
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    endsAt: new Date(Date.now() + 93600000).toISOString(),
    capacity: 2,
    experienceLevel: 'all-levels',
    ...overrides,
  })
}
async function capture(page, path) {
  for (const image of await page.locator('main img').all()) {
    await image.scrollIntoViewIfNeeded()
    await expect.poll(() => image.evaluate((node) => node.complete && node.naturalWidth > 0)).toBe(true)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path, fullPage: true })
}

test('two real accounts create, persist, join, leave, edit and confirm deletion through the UI', async ({
  page,
  browser,
}, info) => {
  const errors = watchErrors(page)
  const writes = []
  page.on('request', (request) => {
    if (
      /\/api\/events(?:\?|\/|$)/.test(request.url()) &&
      ['POST', 'PATCH'].includes(request.method()) &&
      request.postData()
    )
      writes.push(request.postDataJSON())
  })
  await page.goto('/events/new')
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  await login(page, host, '/events/new')
  await page.getByRole('button', { name: 'Create Event', exact: true }).click()
  await expect(page.getByRole('alert').first()).toBeVisible()
  const title = `${prefix} public Podgorica`
  const { expectedStart } = await fillForm(page, title)
  await expect(page.locator('input[type="file"]')).toHaveCount(1)
  await expect(page.locator('#event-venue')).toHaveValue('')
  await capture(page, info.outputPath('real-create-form.png'))
  const createdResponse = page.waitForResponse(
    (result) =>
      new URL(result.url()).pathname === '/api/events' &&
      result.request().method() === 'POST' &&
      result.status() === 201,
  )
  await page.getByRole('button', { name: 'Create Event', exact: true }).click()
  const created = await (await createdResponse).json()
  expect(created.id).toMatch(/^[\da-f]{8}-[\da-f-]{27}$/i)
  expect(created.host.id).toBe(host.id)
  expect(Date.parse(created.startsAt)).toBe(Date.parse(expectedStart))
  expect(created.venue).toBeNull()
  const path = `/events/${created.id}`
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Edit Event$/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Join Event$/i })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText(address, { exact: true })).toBeVisible()
  expect(
    (await db.query('select count(*)::int n from public.events where id=$1', [created.id])).rows[0].n,
  ).toBe(1)
  await page.getByRole('link', { name: 'Explore events', exact: true }).first().click()
  await page.locator('#event-search').fill(title)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible()
  await page.getByRole('link', { name: title, exact: true }).click()

  const contextB = await browser.newContext({
    baseURL: 'http://127.0.0.1:5173',
    viewport: info.project.use.viewport,
    timezoneId: 'Europe/Budapest',
    colorScheme: info.project.use.colorScheme,
  })
  await contextB.addInitScript(
    (theme) => localStorage.setItem('rollcall.theme', theme),
    info.project.metadata.theme,
  )
  const pageB = await contextB.newPage()
  const errorsB = watchErrors(pageB)
  try {
    await login(pageB, player, path)
    await expect(pageB.getByText(address, { exact: true })).toHaveCount(0)
    await expect(pageB.getByRole('link', { name: /^Edit Event$/i })).toHaveCount(0)
    await expect(pageB.getByRole('button', { name: /^Delete Event$/i })).toHaveCount(0)
    await pageB.getByRole('button', { name: /^Join Event$/i }).click({ clickCount: 2 })
    await expect(pageB.getByRole('button', { name: /^Leave Event$/i })).toBeEnabled()
    await expect(pageB.getByText(address, { exact: true })).toBeVisible()
    expect((await api('GET', path, player)).participantCount).toBe(1)
    expect(
      (
        await db.query('select count(*)::int n from public.event_participants where event_id=$1', [
          created.id,
        ])
      ).rows[0].n,
    ).toBe(1)
    await pageB.reload()
    await expect(pageB.getByRole('button', { name: /^Leave Event$/i })).toBeEnabled()
    await expect(pageB.getByText(address, { exact: true })).toBeVisible()
    await capture(pageB, info.outputPath('real-participant.png'))
    await pageB.getByRole('button', { name: /^Leave Event$/i }).click()
    await expect(pageB.getByRole('button', { name: /^Join Event$/i })).toBeEnabled()
    await expect(pageB.getByText(address, { exact: true })).toHaveCount(0)
    expect((await api('GET', path, player)).participantCount).toBe(0)
    expect('address' in (await api('GET', path, player))).toBe(false)
    await pageB.goto(`${path}/edit`)
    await expect(pageB.getByRole('heading', { name: /only.*host/i })).toBeVisible()
    expect((await response('DELETE', path, player)).status).toBe(404)
  } finally {
    await contextB.close()
  }
  await page.bringToFront()
  await refocus(page)
  await expect(page.getByText('0 of 2 player seats filled', { exact: true }).first()).toBeVisible()
  await page.getByRole('link', { name: /^Edit Event$/i }).click()
  await expect(page.locator('#event-location-city')).toHaveValue('Podgorica')
  await expect(page.locator('#event-address')).toHaveValue(address)
  const updatedTitle = `${prefix} updated in Serbia`
  await page.locator('#event-title').fill(updatedTitle)
  await chooseCity(page, 'RS', 'Beograd')
  await page.locator('#event-capacity').fill('4')
  await page.locator('#event-gameId').selectOption(String(catalog[1].id))
  // Relay an actual backend validation failure and preserve the entered draft.
  await page.route(`**/api/events/${created.id}`, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue()
      return
    }
    const result = await route.fetch({
      postData: JSON.stringify({ ...route.request().postDataJSON(), cityId: 2147483647 }),
    })
    await route.fulfill({ response: result })
  })
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert').first()).toBeVisible()
  await expect(page.locator('#event-title')).toHaveValue(updatedTitle)
  expect((await api('GET', path, host)).title).toBe(title)
  await page.unroute(`**/api/events/${created.id}`)
  await capture(page, info.outputPath('real-edit-form.png'))
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  await expect(page.getByRole('heading', { name: updatedTitle, exact: true })).toBeVisible()
  await expect(page.getByText(/Belgrade, Serbia/).first()).toBeVisible()
  const updated = await api('GET', path, host)
  expect(updated.country.isoCode).toBe('RS')
  expect(updated.capacity).toBe(4)
  expect(updated.game.id).toBe(catalog[1].id)
  expect(updated.host.id).toBe(host.id)
  await page.getByRole('link', { name: 'Explore events', exact: true }).first().click()
  await page.locator('#event-search').fill(updatedTitle)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('link', { name: updatedTitle, exact: true })).toBeVisible()
  await expect(page.getByText(/Belgrade, Serbia/).first()).toBeVisible()
  await page.getByRole('link', { name: updatedTitle, exact: true }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: updatedTitle, exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Delete Event$/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(/participation/i)
  await capture(page, info.outputPath('real-delete-confirmation.png'))
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Delete Event$/i })).toBeFocused()
  await page.getByRole('button', { name: /^Delete Event$/i }).click()
  await dialog.getByRole('button', { name: /cancel/i }).click()
  await expect(page.getByRole('heading', { name: updatedTitle, exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Delete Event$/i }).click()
  await dialog.getByRole('button', { name: /delete/i }).click()
  await expect(page).toHaveURL(/\/events$/)
  await expect(page.getByText(/event.*deleted/i).first()).toBeVisible()
  expect((await response('GET', path, host)).status).toBe(404)
  expect((await api('GET', `/api/events?search=${encodeURIComponent(updatedTitle)}`)).items).toHaveLength(0)
  for (const body of writes)
    for (const forbidden of [
      'hostId',
      'organizerId',
      'userId',
      'countryId',
      'countryCode',
      'city',
      'location',
      'imageUrl',
      'participantCount',
      'attendeeIds',
      'id',
    ])
      expect(forbidden in body).toBe(false)
  expect(errors).toEqual([])
  expect(errorsB).toEqual([])
})

test('real server conflicts, unavailable mutations, private/unlisted rules and stale protected reads', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== '1440-dark',
    'Focused error and privacy scenarios run once; primary workflow covers all viewport/themes.',
  )
  const errors = watchErrors(page)
  const full = await fixture({ capacity: 1 })
  const path = `/events/${full.id}`
  await login(page, player, path)
  await expect(page.getByRole('button', { name: /^Join Event$/i })).toBeEnabled()
  await api('POST', `${path}/attendees/me`, third)
  await page.getByRole('button', { name: /^Join Event$/i }).click()
  await expect(page.getByText('This event is full.', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Full', { exact: true })).toBeVisible()
  await expect(page.getByText(address, { exact: true })).toHaveCount(0)

  const event = await fixture({ visibility: 'unlisted' })
  const eventPath = `/events/${event.id}`
  await page.goto(eventPath)
  await page.route(`**/api/events/${event.id}/attendees/me`, (route) => route.abort('failed'))
  await page.getByRole('button', { name: /^Join Event$/i }).click()
  await expect(page.getByRole('alert').first()).toBeVisible()
  await expect(page.getByText(address, { exact: true })).toHaveCount(0)
  expect((await api('GET', eventPath, player)).viewer.hasJoined).toBe(false)
  await page.unroute(`**/api/events/${event.id}/attendees/me`)
  await page.getByRole('button', { name: /^Join Event$/i }).click()
  await expect(page.getByRole('button', { name: /^Leave Event$/i })).toBeEnabled()
  await expect(page.getByText(address, { exact: true })).toBeVisible()

  let held,
    release,
    readStarted = false,
    first = true
  const ready = new Promise((resolve) => {
    held = resolve
  })
  const released = new Promise((resolve) => {
    release = resolve
  })
  await page.route(`**/api/events/${event.id}`, async (route) => {
    if (!first) {
      await route.continue()
      return
    }
    first = false
    const result = await route.fetch()
    readStarted = true
    held()
    await released
    await route.fulfill({ response: result }).catch(() => {})
  })
  await refocus(page)
  await expect.poll(() => readStarted, { timeout: 10000 }).toBe(true)
  await ready
  await page.getByRole('button', { name: /^Leave Event$/i }).click()
  await expect(page.getByText(address, { exact: true })).toHaveCount(0)
  release()
  await page.unroute(`**/api/events/${event.id}`)
  await expect(page.getByRole('button', { name: /^Join Event$/i })).toBeEnabled()
  await expect(page.getByText(address, { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: /^Join Event$/i }).click()
  await expect(page.getByRole('button', { name: /^Leave Event$/i })).toBeEnabled()
  await api('PATCH', eventPath, host, { visibility: 'private' })
  await page.reload()
  await expect(page.getByText('Private event', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: /^Leave Event$/i }).click()
  await expect(page).toHaveURL(/\/events$/)
  await page.goto(eventPath)
  await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible()
  const hidden = await fixture({ visibility: 'private' })
  await page.goto(`/events/${hidden.id}`)
  await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible()
  const cancelled = await fixture()
  await api('PATCH', `/api/events/${cancelled.id}`, host, { status: 'cancelled' })
  await page.goto(`/events/${cancelled.id}`)
  await expect(page.getByRole('button', { name: /closed|cancel|started/i })).toBeDisabled()
  const starting = await fixture({ startsAt: new Date(Date.now() + 4000).toISOString() })
  await page.goto(`/events/${starting.id}`)
  await expect(page.getByRole('button', { name: /^Join Event$/i })).toBeEnabled()
  await expect(page.getByRole('button', { name: /closed|started/i })).toBeDisabled({ timeout: 10000 })
  await page.goto('/events/not-a-uuid/edit')
  await expect(page.getByRole('heading', { name: 'Invalid event ID' })).toBeVisible()
  expect(errors).toEqual([])
})

test('mutation responses cannot navigate or restore protected state after account changes', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== '1440-dark',
    'Run the actual mutation/account race once alongside the viewport acceptance matrix.',
  )
  const event = await fixture()
  const path = `/events/${event.id}`
  await login(page, player, path)
  let held, release
  const ready = new Promise((resolve) => {
    held = resolve
  })
  const released = new Promise((resolve) => {
    release = resolve
  })
  await page.route(`**/api/events/${event.id}/attendees/me`, async (route) => {
    const result = await route.fetch()
    held()
    await released
    await route.fulfill({ response: result }).catch(() => {})
  })
  await page.getByRole('button', { name: /^Join Event$/i }).click()
  await ready
  await switchAccount(page, host)
  await expect(page.getByRole('link', { name: /^Edit Event$/i })).toBeVisible()
  release()
  await page.unroute(`**/api/events/${event.id}/attendees/me`)
  await expect(page.getByRole('button', { name: /^Leave Event$/i })).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  expect((await api('GET', path, host)).viewer.hasJoined).toBe(false)
  await api('PATCH', path, host, { visibility: 'private' })
  await switchAccount(page, player)
  await expect(page.getByRole('button', { name: /^Leave Event$/i })).toBeEnabled()
  let leaveHeld, leaveRelease
  const leaveReady = new Promise((resolve) => {
    leaveHeld = resolve
  })
  const leaveReleased = new Promise((resolve) => {
    leaveRelease = resolve
  })
  await page.route(`**/api/events/${event.id}/attendees/me`, async (route) => {
    const result = await route.fetch()
    leaveHeld()
    await leaveReleased
    await route.fulfill({ response: result }).catch(() => {})
  })
  await page.getByRole('button', { name: /^Leave Event$/i }).click()
  await leaveReady
  await switchAccount(page, host)
  await expect(page.getByRole('link', { name: /^Edit Event$/i })).toBeVisible()
  leaveRelease()
  await page.unroute(`**/api/events/${event.id}/attendees/me`)
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  await expect(page.getByRole('heading', { name: event.title, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Leave Event$/i })).toHaveCount(0)
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.getByText(address, { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible()
})

test('visibility, failed create/delete recovery and concurrent capacity validation use real writes', async ({
  page,
}, info) => {
  test.skip(info.project.name !== '1440-dark', 'Additional write edge cases run once.')
  const errors = watchErrors(page)
  await login(page, host, '/events/new')
  const title = `${prefix} private via form`
  await fillForm(page, title, 'private')
  await page.route('**/api/events', (route) => route.abort('failed'))
  await page.getByRole('button', { name: 'Create Event', exact: true }).click()
  await expect(page.getByRole('alert').first()).toBeVisible()
  await expect(page.locator('#event-title')).toHaveValue(title)
  expect(
    (await db.query('select count(*)::int n from public.events where title=$1', [title])).rows[0].n,
  ).toBe(0)
  await page.unroute('**/api/events')
  const createdResponse = page.waitForResponse(
    (result) =>
      new URL(result.url()).pathname === '/api/events' &&
      result.request().method() === 'POST' &&
      result.status() === 201,
  )
  await page.getByRole('button', { name: 'Create Event', exact: true }).click()
  const created = await (await createdResponse).json()
  const path = `/events/${created.id}`
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  await expect(page.getByText('Private event', { exact: true }).first()).toBeVisible()
  expect((await response('GET', path, player)).status).toBe(404)
  expect((await api('GET', `/api/events?search=${encodeURIComponent(title)}`)).items).toHaveLength(0)
  await page.getByRole('link', { name: /^Edit Event$/i }).click()
  await page.locator('#event-visibility').selectOption('unlisted')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  expect((await api('GET', path, player)).visibility).toBe('unlisted')
  expect((await api('GET', `/api/events?search=${encodeURIComponent(title)}`)).items).toHaveLength(0)

  await page.route(`**/api/events/${created.id}`, async (route) => {
    if (route.request().method() === 'DELETE') await route.abort('failed')
    else await route.continue()
  })
  await page.getByRole('button', { name: /^Delete Event$/i }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /delete/i }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  expect((await response('GET', path, host)).status).toBe(200)
  await page.unroute(`**/api/events/${created.id}`)
  await dialog.getByRole('button', { name: /delete/i }).click()
  await expect(page).toHaveURL(/\/events$/)
  expect((await response('GET', path, host)).status).toBe(404)

  const occupied = await fixture({ capacity: 3 })
  const occupiedPath = `/events/${occupied.id}`
  await api('POST', `${occupiedPath}/attendees/me`, player)
  await page.goto(`${occupiedPath}/edit`)
  await expect(page.locator('#event-capacity')).toHaveValue('3')
  await page.locator('#event-capacity').fill('1')
  await api('POST', `${occupiedPath}/attendees/me`, third)
  const conflict = page.waitForResponse(
    (result) => result.request().method() === 'PATCH' && result.status() === 409,
  )
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await conflict
  await expect(
    page.getByText('Capacity cannot be lower than current attendance.', { exact: false }).first(),
  ).toBeVisible()
  await expect(page.locator('#event-capacity')).toHaveValue('1')
  await page.locator('#event-capacity').fill('3')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${occupiedPath}$`))
  expect((await api('GET', occupiedPath, host)).participantCount).toBe(2)
  expect(errors).toEqual([])
})
