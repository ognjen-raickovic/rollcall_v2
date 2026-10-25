import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'

test.skip(
  process.env.RUN_LOCAL_EVENT_READ_UI !== 'true',
  'Requires explicitly enabled local Supabase, Fastify and Vite.',
)
test.use({ trace: 'off' }) // Session headers and browser storage must never enter traces.

let db
let host
let other
let fixtures
const emails = []
const prefix = `ReadUI-${randomUUID().slice(0, 8)}`
const password = `Rc!${randomUUID()}aA7`
const privateAddress = 'Synthetic protected read integration address'

async function api(method, path, actor, body) {
  const options = {
    method,
    headers: {
      ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    signal: AbortSignal.timeout(10000),
  }
  if (body !== undefined) options.body = JSON.stringify(body)
  const response = await fetch(`http://127.0.0.1:3001${path}`, options)
  expect(response.ok, 'Local fixture API must succeed; credentials are not logged.').toBe(true)
  return response.status === 204 ? undefined : response.json()
}

async function account(label) {
  const email = `event-read-ui-${label}-${randomUUID()}@example.test`
  emails.push(email)
  const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth
  const registered = await auth.signUp({ email, password })
  expect(Boolean(registered.error)).toBe(false)
  const id = registered.data.user?.id
  if (!id) throw new Error('Local fixture registration failed.')
  const hash = (await db.query('select confirmation_token from auth.users where id=$1', [id])).rows[0]
    ?.confirmation_token
  if (!hash) throw new Error('Local fixture confirmation is unavailable.')
  const confirmed = await auth.verifyOtp({ token_hash: hash, type: 'signup' })
  expect(Boolean(confirmed.error)).toBe(false)
  const token = confirmed.data.session?.access_token
  if (!token) throw new Error('Local fixture session is unavailable.')
  return { id, token, email }
}

test.beforeAll(async () => {
  process.loadEnvFile(new URL('../../backend/.env', import.meta.url))
  const supabase = new URL(process.env.SUPABASE_URL)
  const connection = new URL(process.env.GEOGRAPHY_DATABASE_URL)
  if (
    ![supabase.hostname, connection.hostname].every((name) =>
      ['127.0.0.1', 'localhost', '[::1]'].includes(name),
    )
  )
    throw new Error('Event browser fixtures require local services.')
  const require = createRequire(new URL('../../backend/package.json', import.meta.url))
  const { Client } = require('pg')
  db = new Client({ connectionString: connection.href, connectionTimeoutMillis: 5000 })
  await db.connect()
  host = await account('host')
  other = await account('other')
  await api('PATCH', '/api/me/profile', host, { displayName: 'Read integration host' })
  const games = await api('GET', '/api/games')
  const game = games.find((entry) => entry.category === 'role-playing')
  const alternateGame = games.find((entry) => entry.category === 'board-game')
  const montenegro = (await api('GET', '/api/cities?country=ME&q=Podgorica'))[0]
  const serbia = (await api('GET', '/api/cities?country=RS&q=Beograd'))[0]
  if (!game || !alternateGame || !montenegro || !serbia)
    throw new Error('Local fixture catalogs are incomplete.')
  fixtures = { game, alternateGame, montenegro, serbia, public: [] }
  async function event(index, overrides = {}) {
    return api('POST', '/api/events', host, {
      title: `${prefix} Table ${String(index).padStart(2, '0')}`,
      description: 'A genuine local PostgreSQL fixture created through the authenticated event API.',
      gameId: index % 2 ? alternateGame.id : game.id,
      cityId: index % 2 ? serbia.id : montenegro.id,
      startsAt: new Date(Date.now() + 86400000 + index * 60000).toISOString(),
      endsAt: new Date(Date.now() + 93600000 + index * 60000).toISOString(),
      address: privateAddress,
      capacity: index === 0 ? 1 : 4,
      venue: 'Local integration venue',
      experienceLevel: 'all-levels',
      ...overrides,
    })
  }
  for (let index = 0; index < 14; index++) fixtures.public.push(await event(index))
  await api('POST', `/api/events/${fixtures.public[0].id}/attendees/me`, other)
  fixtures.private = await event(20, { visibility: 'unlisted' })
  await api('POST', `/api/events/${fixtures.private.id}/attendees/me`, other)
  await api('PATCH', `/api/events/${fixtures.private.id}`, host, { visibility: 'private' })
  fixtures.hidden = await event(21, { visibility: 'private' })
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

async function login(page, actor, returnTo) {
  if (new URL(page.url()).pathname !== returnTo) await page.goto(returnTo)
  await page.getByRole('link', { name: 'Log in', exact: true }).first().click()
  await page.getByLabel('Email', { exact: true }).fill(actor.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${returnTo.replaceAll('/', '\\/')}$`))
}

function watchErrors(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    // Missing/private events and the deliberately aborted error-state request below
    // may emit resource errors. Other browser console errors are regressions.
    if (
      message.type() === 'error' &&
      !/Failed to load resource:.*(?:net::ERR_FAILED|status of (?:400|401|403|404|503))/.test(message.text())
    )
      errors.push(message.text())
  })
  return errors
}

async function capture(page, path) {
  // Full-page screenshots do not scroll lazy images into view. Exercise real scrolling
  // and verify the actual local illustrations before capturing the complete layout.
  for (const image of await page.locator('main img').all()) {
    await image.scrollIntoViewIfNeeded()
    await expect.poll(() => image.evaluate((node) => node.complete && node.naturalWidth > 0)).toBe(true)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path, fullPage: true })
}

test('real discovery, cursor pages, URL filters, themes and read-only navigation', async ({ page }, info) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Good games.' })).toBeVisible()
  await expect(page.locator('main article')).toHaveCount(3)
  await expect(page.getByText(/choose a demo profile/i)).toHaveCount(0)
  await capture(page, info.outputPath('real-homepage.png'))
  await page.goto(`/events?search=${prefix}`)
  const cards = page.locator('main article')
  await expect(cards).toHaveCount(12)
  await expect(page.getByRole('button', { name: 'Load more', exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Load more', exact: false }).click()
  await expect(cards).toHaveCount(14)
  await expect(page.getByRole('button', { name: 'Load more', exact: false })).toHaveCount(0)
  await expect(page.getByText(privateAddress, { exact: true })).toHaveCount(0)
  expect(await cards.first().innerText()).not.toContain('Free entry')
  await capture(page, info.outputPath('real-discovery.png'))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  for (const [query, count] of [
    [`country=ME&cityId=${fixtures.montenegro.id}`, 7],
    [`country=RS&gameId=${fixtures.alternateGame.id}`, 7],
    ['availableOnly=true', 12],
    [`gameId=${fixtures.game.id}`, 7],
    ['category=board-game', 6],
  ]) {
    await page.goto(`/events?search=${prefix}&${query}`)
    await expect(cards).toHaveCount(count)
  }
  await page.getByRole('button', { name: 'Load more', exact: false }).click()
  await expect(cards).toHaveCount(7)
  await page.getByRole('link', { name: 'Reset filters', exact: true }).click()
  await expect(page).toHaveURL(/\/events$/)
  await expect(cards).toHaveCount(12)
  await page.goto(`/events?search=${prefix}&country=ME`)
  await expect(cards).toHaveCount(7)
  await page.locator('#event-search').fill(`${prefix} Table 02`)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(cards).toHaveCount(1)
  await page.goBack()
  await expect(cards).toHaveCount(7)
  await page.goForward()
  await expect(cards).toHaveCount(1)
  await page.goto(`/events?search=${prefix}`)
  await page.locator('#filter-location-country').selectOption('ME')
  await page.locator('#filter-location-city').fill('Podgorica')
  await expect(page.getByRole('listbox').getByRole('option').first()).toBeVisible()
  await page.locator('#filter-location-city').press('ArrowDown')
  await page.locator('#filter-location-city').press('Enter')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(cards).toHaveCount(7)
  await expect(page).toHaveURL(/cityId=/)
  await page.goto('/events?gameId=invalid')
  await expect(page.getByRole('alert')).toContainText('valid')
  await page.goto(`/events?search=${prefix}-nothing-matches`)
  await expect(page.getByText('No upcoming events match your filters.', { exact: true })).toBeVisible()

  await page.route('**/api/events?*', (route) => route.abort('failed'))
  await page.goto('/events?search=service-error')
  await expect(page.getByRole('alert')).toContainText('load')
  await page.unroute('**/api/events?*')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.goto('/events/new')
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await page.goto('/demo/events')
  await expect(page.getByRole('heading', { name: 'Development demo events' })).toBeVisible()
  await page.goto('/demo/events/1')
  await expect(
    page.getByText('Development demo event. Changes remain in memory and reset on reload.', { exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})

test('real viewer permissions, logout and switching accounts never reuse protected details', async ({
  page,
}, info) => {
  const event = fixtures.public[2]
  const path = `/events/${event.id}`
  const errors = watchErrors(page)
  await page.goto(path)
  await expect(page.getByRole('heading', { name: event.title, exact: true })).toBeVisible()
  await expect(page.getByText(privateAddress, { exact: true })).toHaveCount(0)
  await page.goto('/events/not-a-uuid')
  await expect(page.getByRole('heading', { name: 'Invalid event ID' })).toBeVisible()
  await page.goto(`/events/${randomUUID()}`)
  await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible()
  await login(page, host, path)
  await expect(page.getByText(privateAddress, { exact: true })).toBeVisible()
  await capture(page, info.outputPath('real-host-details.png'))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  // Switch two real accounts without reloading or replacing the QueryClient.
  async function switchAccount(actor) {
    const failed = await page.evaluate(
      async ({ email, password }) => {
        const { authClient } = await import('/src/features/users/api/auth-client.ts')
        return Boolean((await authClient().auth.signInWithPassword({ email, password })).error)
      },
      { email: actor.email, password },
    )
    expect(failed).toBe(false)
  }
  await switchAccount(other)
  await expect(page.getByText(privateAddress, { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: event.title, exact: true })).toBeVisible()
  await switchAccount(host)
  await expect(page.getByText(privateAddress, { exact: true })).toBeVisible()

  // Hold an actual host response while Auth changes. Its late completion must not
  // repopulate the previous account's protected detail query or render its address.
  let releaseHost
  let notifyHeld
  let heldFirst = false
  const released = new Promise((resolve) => {
    releaseHost = resolve
  })
  const held = new Promise((resolve) => {
    notifyHeld = resolve
  })
  await page.route(`**/api/events/${event.id}`, async (route) => {
    if (heldFirst) {
      await route.continue()
      return
    }
    heldFirst = true
    const response = await route.fetch()
    notifyHeld()
    await released
    await route.fulfill({ response }).catch(() => {}) // The old fetch is normally aborted.
  })
  await page.getByRole('link', { name: 'Back to events', exact: true }).click()
  await page.getByRole('link', { name: `View ${event.title}`, exact: true }).click()
  await held
  await expect(page.getByRole('status', { name: 'Loading event details' })).toBeVisible()
  await switchAccount(other)
  await expect(page.getByRole('heading', { name: event.title, exact: true })).toBeVisible()
  await expect(page.getByText(privateAddress, { exact: true })).toHaveCount(0)
  releaseHost()
  await page.unroute(`**/api/events/${event.id}`)
  await expect(page.getByText(privateAddress, { exact: true })).toHaveCount(0)
  await switchAccount(host)
  await expect(page.getByText(privateAddress, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.getByText(privateAddress, { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: event.title, exact: true })).toBeVisible()
  await login(page, other, path)
  await expect(page.getByText(privateAddress, { exact: true })).toHaveCount(0)
  await page.goto(`/events/${fixtures.private.id}`)
  await expect(page.getByText(privateAddress, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /leav/i })).toBeEnabled()
  await capture(page, info.outputPath('real-participant-details.png'))
  await page.goto(`/events/${fixtures.hidden.id}`)
  await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible()
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'Make yourself at home' })).toBeVisible()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await page.goto(`/events/${fixtures.private.id}`)
  await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible()
  expect(errors).toEqual([])
})
