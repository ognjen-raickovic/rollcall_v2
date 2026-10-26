import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'
test.skip(process.env.RUN_LOCAL_MODERATION_UI !== 'true', 'Requires migrated local Supabase.')
test.use({ trace: 'off', screenshot: 'off', video: 'off' })
let db, host, reporter, admin, root, submission, dismissal, cancellation
const ids = [],
  events = [],
  password = `Rc!${randomUUID()}aA7`
async function api(method, path, actor, body) {
  return fetch(`http://127.0.0.1:3001/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${actor.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}
test.beforeAll(async () => {
  process.loadEnvFile(new URL('../../backend/.env', import.meta.url))
  if (
    ![process.env.SUPABASE_URL, process.env.GEOGRAPHY_DATABASE_URL].every((value) =>
      ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname),
    )
  )
    throw Error('Local fixtures only')
  const require = createRequire(new URL('../../backend/package.json', import.meta.url)),
    { Client } = require('pg')
  db = new Client({ connectionString: process.env.GEOGRAPHY_DATABASE_URL })
  await db.connect()
  async function account(role) {
    const email = `moderation-ui-${randomUUID()}@example.test`,
      auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      }).auth
    const result = await auth.signUp({ email, password }),
      id = result.data.user?.id
    if (!id) throw Error('Fixture registration failed')
    ids.push(id)
    const hash = (await db.query('select confirmation_token from auth.users where id=$1', [id])).rows[0]
      .confirmation_token
    const confirmed = await auth.verifyOtp({ token_hash: hash, type: 'signup' }),
      token = confirmed.data.session?.access_token
    if (!token) throw Error('Fixture confirmation failed')
    if (role) await db.query('insert into private.account_roles(profile_id,role) values($1,$2)', [id, role])
    return { id, email, token }
  }
  host = await account()
  reporter = await account()
  admin = await account('admin')
  root = await account('superadmin')
  const game = (await db.query('select id from public.games order by id limit 1')).rows[0].id,
    city = (await db.query('select id from public.cities order by id limit 1')).rows[0].id
  async function event(title) {
    const result = await api('POST', '/events', host, {
      title,
      description: 'Synthetic event for moderation browser acceptance.',
      gameId: game,
      cityId: city,
      address: 'Protected browser fixture address',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      endsAt: new Date(Date.now() + 90000000).toISOString(),
      capacity: 3,
      experienceLevel: 'all-levels',
      visibility: 'public',
    })
    expect(result.status).toBe(201)
    const id = (await result.json()).id
    events.push(id)
    return id
  }
  submission = await event('Reportable meetup')
  dismissal = await event('Dismissal review table')
  cancellation = await event('Cancellation review table')
  for (const id of [dismissal, cancellation])
    expect(
      (
        await api('POST', `/events/${id}/reports`, reporter, {
          reason: 'unsafe',
          description: 'Synthetic concern for review. No private personal information.',
        })
      ).status,
    ).toBe(201)
})
test.afterAll(async () => {
  if (!db) return
  try {
    await db.query('begin')
    await db.query("set local session_replication_role='replica'")
    await db.query('delete from private.moderation_audit where target_event_id=any($1::uuid[])', [events])
    await db.query('delete from private.event_reports where target_event_id=any($1::uuid[])', [events])
    await db.query('delete from private.role_audit where target_id=any($1::uuid[])', [ids])
    await db.query('commit')
    await db.query('delete from public.events where id=any($1::uuid[])', [events])
    await db.query('delete from auth.users where id=any($1::uuid[])', [ids])
  } finally {
    await db.end()
  }
})
async function login(page, actor, target) {
  await page.goto(`/login?returnTo=${encodeURIComponent(target)}`)
  await page.getByLabel('Email', { exact: true }).fill(actor.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${target}$`))
}
test('representative real reporting and moderation workflow', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', () => errors.push('page error'))
  await page.addInitScript(
    (theme) => localStorage.setItem('rollcall.theme', theme),
    info.project.metadata.theme,
  )
  if (info.project.name === '375-dark') {
    await page.goto(`/events/${submission}`)
    await expect(page.getByRole('link', { name: 'Log in to report this event', exact: true })).toBeVisible()
    await login(page, reporter, `/events/${submission}`)
    const trigger = page.getByRole('button', { name: 'Report Event', exact: true })
    await trigger.click()
    await expect(page.getByLabel('Reason', { exact: true })).toBeFocused()
    await page.getByRole('dialog').press('Escape')
    await expect(trigger).toBeFocused()
    await trigger.click()
    await page.getByLabel('Reason', { exact: true }).selectOption('unsafe')
    await page
      .getByLabel('Additional details (optional)', { exact: true })
      .fill('A synthetic safety concern. Please review the event.')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByLabel('Additional details (optional)', { exact: true })).toHaveAttribute(
      'maxlength',
      '1000',
    )
    await page.route(`**/api/events/${submission}/reports`, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Unavailable', fields: {} }),
      }),
    )
    await page.getByRole('button', { name: 'Submit report', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
    await expect(page.getByText('Your report was submitted for review.', { exact: true })).toHaveCount(0)
    await page.unroute(`**/api/events/${submission}/reports`)
    await page.getByRole('button', { name: 'Submit report', exact: true }).click()
    await expect(page.getByText('Your report was submitted for review.', { exact: true })).toBeVisible()
    expect(
      (await db.query('select reporter_id from private.event_reports where target_event_id=$1', [submission]))
        .rows[0].reporter_id === reporter.id,
    ).toBe(true)
    await page.goto('/admin/reports')
    await expect(page.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
  } else {
    await login(page, admin, '/admin/reports')
    await page.getByRole('button', { name: /Dismissal review table/ }).click()
    await expect(
      page.getByRole('heading', { name: 'Review: Dismissal review table', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Dismiss report', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await page
      .getByLabel('Internal reason (5–500 characters)', { exact: true })
      .fill('Reviewed: insufficient evidence for further action.')
    await page.getByRole('button', { name: 'Confirm dismissal', exact: true }).click()
    await expect(page.getByText('Report dismissed.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Cancellation review table/ }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Cancel reported event', exact: true }).click()
    await page
      .getByLabel('Internal reason (5–500 characters)', { exact: true })
      .fill('Reviewed: cancel this unsafe event under the event safety policy.')
    await page.getByRole('button', { name: 'Confirm cancellation', exact: true }).click()
    await expect(page.getByText('Event cancelled and report actioned.', { exact: true })).toBeVisible()
    await expect(page.getByText('Reported event cancelled', { exact: true })).toBeVisible()
    await expect(page.getByText('Protected browser fixture address', { exact: true })).toHaveCount(0)
    expect((await api('POST', `/events/${cancellation}/attendees/me`, reporter)).status).toBe(409)
    expect((await api('GET', `/events/${cancellation}`, host)).status).toBe(200)
    const list = await (await api('GET', '/events', reporter)).json()
    expect(list.items.some((item) => item.id === cancellation)).toBe(false)
    await page.getByLabel('Report status', { exact: true }).selectOption('actioned')
    await page.getByRole('button', { name: /Cancellation review table/ }).click()
    await expect(page.getByText('Reported event cancelled', { exact: true })).toBeVisible()
    expect((await api('PATCH', `/admin/users/${admin.id}/role`, root, { role: 'user' })).status).toBe(200)
    await page.goto('/admin/reports')
    await expect(page.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible()
    expect((await api('GET', '/admin/event-reports', admin)).status).toBe(403)
    expect((await api('PATCH', `/admin/users/${admin.id}/role`, root, { role: 'admin' })).status).toBe(200)
    let release,
      started = false
    const held = new Promise((resolve) => {
      release = resolve
    })
    await page.route('**/api/admin/event-reports?*', async (route) => {
      const response = await route.fetch()
      started = true
      await held
      await route.fulfill({ response }).catch(() => {})
    })
    try {
      await page.goto('/admin/reports')
      await expect.poll(() => started).toBe(true)
      await page.getByRole('button', { name: 'Log out', exact: true }).click()
      await login(page, reporter, '/admin/reports')
      release()
      await expect(page.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible()
      await expect(
        page.getByRole('heading', { name: 'Review: Cancellation review table', exact: true }),
      ).toHaveCount(0)
      await expect(page.getByRole('button', { name: /Cancellation review table/ })).toHaveCount(0)
    } finally {
      release()
      await page.unroute('**/api/admin/event-reports?*')
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
