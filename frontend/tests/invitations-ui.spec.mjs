import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'
test.skip(process.env.RUN_LOCAL_INVITATIONS_UI !== 'true', 'Requires local invitation setup.')
test.use({ trace: 'off', screenshot: 'off' })
let db, host, player, id
const emails = [],
  password = `Rc!${randomUUID()}aA7`
async function api(method, path, actor, body) {
  const options = {
    method,
    headers: {
      ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
      ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
  }
  if (body !== undefined) options.body = body instanceof FormData ? body : JSON.stringify(body)
  return fetch(`http://127.0.0.1:3001/api${path}`, options)
}
test.beforeAll(async () => {
  process.loadEnvFile(new URL('../../backend/.env', import.meta.url))
  if (
    ![process.env.SUPABASE_URL, process.env.GEOGRAPHY_DATABASE_URL].every((value) =>
      ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname),
    )
  )
    throw Error('Local fixtures only')
  const require = createRequire(new URL('../../backend/package.json', import.meta.url)),
    { Client } = require('pg'),
    sharp = require('sharp')
  db = new Client({ connectionString: process.env.GEOGRAPHY_DATABASE_URL })
  await db.connect()
  async function account() {
    const email = `invitation-ui-${randomUUID()}@example.test`
    emails.push(email)
    const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth
    const signup = await auth.signUp({ email, password })
    const userId = signup.data.user?.id
    if (!userId) throw Error('Local registration failed')
    const hash = (await db.query('select confirmation_token from auth.users where id=$1', [userId])).rows[0]
      .confirmation_token
    const result = await auth.verifyOtp({ token_hash: hash, type: 'signup' })
    if (!result.data.session) throw Error('Local confirmation failed')
    return { id: userId, email, token: result.data.session.access_token }
  }
  host = await account()
  player = await account()
  const game = (await db.query('select id from public.games order by id limit 1')).rows[0].id,
    city = (await db.query('select id from public.cities order by id limit 1')).rows[0].id
  const created = await api('POST', '/events', host, {
    title: 'Private invitation browser table',
    description: 'A synthetic private event for invitation browser acceptance.',
    gameId: game,
    cityId: city,
    address: 'Synthetic invitation address',
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    endsAt: new Date(Date.now() + 90000000).toISOString(),
    capacity: 3,
    experienceLevel: 'all-levels',
    visibility: 'private',
  })
  expect(created.status).toBe(201)
  id = (await created.json()).id
  const bytes = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#654599' } })
      .png()
      .toBuffer(),
    form = new FormData()
  form.set('file', new File([bytes], 'cover.png', { type: 'image/png' }))
  expect((await api('POST', `/events/${id}/cover`, host, form)).ok).toBe(true)
})
test.afterAll(async () => {
  try {
    if (id) {
      await api('DELETE', `/events/${id}`, host)
      await api('POST', `/events/${id}/cover/cleanup`, host)
      await db.query("delete from private.event_cover_objects where event_id=$1 and state='deleted'", [id])
    }
    await db.query('delete from auth.users where email=any($1::text[])', [emails])
  } finally {
    await db?.end()
  }
})
async function login(page, actor, target) {
  await page.goto(`/login?returnTo=${encodeURIComponent(target)}`)
  await page.getByLabel('Email', { exact: true }).fill(actor.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${target}$`))
}
test('host reveal/copy/rotate and keyboard admission preserve private address and cover permissions', async ({
  page,
  browser,
}, info) => {
  const failures = []
  page.on('pageerror', () => failures.push('page error'))
  await page.addInitScript(
    (theme) => localStorage.setItem('rollcall.theme', theme),
    info.project.metadata.theme,
  )
  let other, code, old
  try {
    await login(page, host, `/events/${id}`)
    await page.getByRole('button', { name: 'Reveal code', exact: true }).click()
    const output = page.getByLabel('Room code', { exact: true })
    await expect(output).toBeVisible()
    old = await output.textContent()
    expect(typeof old === 'string' && old.length === 19).toBe(true)
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value) => {
            window.__testCopied = value
          },
        },
      }),
    )
    await page.getByRole('button', { name: 'Copy code', exact: true }).click()
    await expect(page.getByText('Code copied.', { exact: true })).toBeVisible()
    expect(await page.evaluate((value) => window.__testCopied === value, old)).toBe(true)
    await page.getByRole('button', { name: 'Regenerate code', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm regeneration', exact: true }).click()
    await expect(output).toBeVisible()
    code = await output.textContent()
    expect(code !== old).toBe(true)
    await page.getByRole('button', { name: 'Hide code', exact: true }).click()
    await page.reload()
    await page.getByRole('button', { name: 'Reveal code', exact: true }).click()
    await expect(output).toBeVisible()
    expect((await output.textContent()) === code).toBe(true)
    await page.getByRole('button', { name: 'Hide code', exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('host-controls-hidden.png'), fullPage: true })
    other = await browser.newContext({
      baseURL: 'http://127.0.0.1:5173',
      viewport: info.project.use.viewport,
    })
    const p = await other.newPage()
    await login(p, player, '/events')
    await p.getByRole('button', { name: 'Join private event', exact: true }).click()
    await expect(p.getByLabel('Room code', { exact: true })).toBeFocused()
    await p.getByLabel('Room code', { exact: true }).press('Escape')
    await expect(p.getByRole('button', { name: 'Join private event', exact: true })).toBeFocused()
    await p.getByRole('button', { name: 'Join private event', exact: true }).click()
    await p.getByLabel('Room code', { exact: true }).fill(old)
    await p.getByLabel('Room code', { exact: true }).press('Enter')
    await expect(p.getByRole('alert')).toContainText(/highlighted|code|request/i)
    await p.getByLabel('Room code', { exact: true }).fill(code.toLowerCase())
    await p.getByLabel('Room code', { exact: true }).press('Enter')
    await expect(p).toHaveURL(new RegExp(`/events/${id}$`))
    await expect(p.getByText('Synthetic invitation address', { exact: true })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Reveal code', exact: true })).toHaveCount(0)
    await p.reload()
    await expect(p.getByRole('button', { name: 'Leave Event', exact: true })).toBeEnabled()
    await expect
      .poll(() =>
        p
          .locator('img')
          .evaluateAll((nodes) =>
            nodes.some(
              (n) =>
                n.complete && n.naturalWidth > 0 && n.src.includes('/storage/v1/object/sign/event-covers/'),
            ),
          ),
      )
      .toBe(true)
    await p.getByRole('button', { name: 'Leave Event', exact: true }).click()
    await expect(p).toHaveURL(/\/events$/)
    expect((await api('GET', `/events/${id}`, player)).status).toBe(404)
    expect((await api('GET', `/events/${id}/cover-url`, player)).status).toBe(404)
    await page.getByRole('button', { name: 'Reveal code', exact: true }).click()
    await expect(output).toBeVisible()
    await page.getByRole('button', { name: 'Log out', exact: true }).click()
    await expect(output).toHaveCount(0)
    await expect(page.getByText('Synthetic invitation address', { exact: true })).toHaveCount(0)
    await login(page, player, `/events/${id}`)
    await expect(page.getByRole('button', { name: 'Reveal code', exact: true })).toHaveCount(0)
    await expect(page.getByText('Synthetic invitation address', { exact: true })).toHaveCount(0)
    expect(
      await page
        .locator('img')
        .evaluateAll((nodes) =>
          nodes.every((node) => !node.src.includes('/storage/v1/object/sign/event-covers/')),
        ),
    ).toBe(true)
    expect(failures).toEqual([])
  } finally {
    // Clear secret-bearing DOM before Playwright can generate failure context.
    await page
      .getByRole('button', { name: 'Hide code', exact: true })
      .click({ timeout: 500 })
      .catch(() => {})
    if (other) {
      for (const p of other.pages())
        await p
          .locator('#private-room-code')
          .fill('', { timeout: 500 })
          .catch(() => {})
      await other.close()
    }
  }
})
