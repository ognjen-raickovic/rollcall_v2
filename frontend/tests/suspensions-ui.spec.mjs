import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'
test.skip(process.env.RUN_LOCAL_SUSPENSIONS_UI !== 'true', 'Requires migrated local Supabase.')
test.use({ trace: 'off', screenshot: 'off', video: 'off' })
let db, user, admin, peer, other, eventId
const ids = [],
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
async function change(suspend) {
  return api(suspend ? 'POST' : 'DELETE', `/admin/users/${user.id}/suspension`, admin, {
    reason: suspend
      ? 'Temporary browser verification suspension.'
      : 'Temporary browser verification reinstatement.',
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
  async function account(name, role) {
    const email = `suspension-ui-${randomUUID()}@example.test`,
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
    await db.query('update public.profiles set display_name=$1 where id=$2', [name, id])
    if (role) await db.query('insert into private.account_roles(profile_id,role) values($1,$2)', [id, role])
    return { id, email, token }
  }
  user = await account('Suspension test player')
  admin = await account('Suspension test moderator', 'admin')
  peer = await account('Protected administrator', 'admin')
  other = await account('Active switching player')
  const game = (await db.query('select id from public.games order by id limit 1')).rows[0].id,
    city = (await db.query('select id from public.cities order by id limit 1')).rows[0].id
  const created = await api('POST', '/events', user, {
    title: 'Private suspension fixture',
    description: 'Synthetic private event for cache protection checks.',
    gameId: game,
    cityId: city,
    address: 'Protected suspension browser address',
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    endsAt: new Date(Date.now() + 90000000).toISOString(),
    capacity: 3,
    experienceLevel: 'all-levels',
    visibility: 'private',
  })
  expect(created.status).toBe(201)
  eventId = (await created.json()).id
})
test.afterAll(async () => {
  if (!db) return
  try {
    await db.query(
      "update private.account_suspensions set status='active',reinstated_at=clock_timestamp(),reinstated_by=suspended_by,reinstatement_reason='Trusted browser fixture cleanup.' where profile_id=any($1::uuid[])",
      [ids],
    )
    if (eventId) await api('DELETE', `/events/${eventId}`, user)
    await db.query('begin')
    await db.query("set local session_replication_role='replica'")
    await db.query('delete from private.suspension_audit where target_id=any($1::uuid[])', [ids])
    await db.query('commit')
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
test('representative account suspension, reinstatement and session privacy', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', () => errors.push('page error'))
  await page.addInitScript(
    (theme) => localStorage.setItem('rollcall.theme', theme),
    info.project.metadata.theme,
  )
  if (info.project.name === '1440-light') {
    await login(page, admin, '/admin/accounts')
    await page.getByLabel('Account UUID', { exact: true }).fill(user.id)
    await page.getByRole('button', { name: 'Look up account', exact: true }).click()
    await expect(page.getByTestId('account-access-status')).toHaveText('active')
    await page.getByRole('button', { name: 'Suspend Account', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await page
      .getByLabel('Internal reason', { exact: true })
      .fill('Temporary browser verification suspension.')
    await page.getByRole('button', { name: 'Confirm suspension', exact: true }).click()
    await expect(page.getByText('Account suspended.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('account-access-status')).toHaveText('suspended')
    const denied = await api('PATCH', '/me/profile', user, { displayName: 'Blocked update' })
    expect(denied.status).toBe(403)
    expect((await denied.json()).code).toBe('ACCOUNT_SUSPENDED')
    await page.getByRole('button', { name: 'Reinstate Account', exact: true }).click()
    await page
      .getByLabel('Internal reason', { exact: true })
      .fill('Temporary browser verification reinstatement.')
    await page.getByRole('button', { name: 'Confirm reinstatement', exact: true }).click()
    await expect(page.getByText('Account reinstated.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('account-access-status')).toHaveText('active')
    expect((await api('PATCH', '/me/profile', user, { displayName: 'Reinstated test player' })).status).toBe(
      200,
    )
    await expect(page.getByText('active → suspended', { exact: true })).toBeVisible()
    await expect(page.getByText('suspended → active', { exact: true })).toBeVisible()
  } else {
    await login(page, user, `/events/${eventId}`)
    await expect(page.getByText('Protected suspension browser address', { exact: true })).toBeVisible()
    expect((await change(true)).status).toBe(200)
    // Mounting the protected profile workflow refreshes authoritative account status.
    await page.getByRole('link', { name: 'Profile', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Account suspended', exact: true })).toBeVisible()
    await expect(page.getByText('Protected suspension browser address', { exact: true })).toHaveCount(0)
    expect((await api('PATCH', '/me/profile', user, { displayName: 'Blocked mobile change' })).status).toBe(
      403,
    )
    await page.getByRole('link', { name: 'Browse public events', exact: true }).click()
    await expect(
      page.getByText(
        'Your account is suspended. You can browse public events; authenticated actions are unavailable.',
        { exact: true },
      ),
    ).toBeVisible()
    await page.getByRole('link', { name: 'View account access', exact: true }).click()
    await page.getByRole('button', { name: 'Log out of RollCall', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible()
    await login(page, other, '/events')
    expect((await api('GET', `/events/${eventId}`, other)).status).toBe(404)
    const responses = []
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname
      if (path === `/api/events/${eventId}` || path === '/api/me/account-status')
        responses.push({
          route: path.endsWith('account-status') ? 'status' : 'event',
          status: response.status(),
        })
    })
    await page.goto(`/events/${eventId}`)
    try {
      await expect(page.getByRole('heading', { name: 'Event not found', exact: true })).toBeVisible()
    } catch (error) {
      console.log('Scoped response diagnostics:', JSON.stringify(responses))
      throw error
    }
    await expect(page.getByText('Protected suspension browser address', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Log out', exact: true }).click()
    await login(page, admin, '/admin/accounts')
    await page.getByLabel('Account UUID', { exact: true }).fill(peer.id)
    await page.getByRole('button', { name: 'Look up account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Protected administrator', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Suspend Account', exact: true })).toHaveCount(0)
    expect(
      (
        await api('POST', `/admin/users/${peer.id}/suspension`, admin, {
          reason: 'Forbidden cross-admin suspension.',
        })
      ).status,
    ).toBe(403)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
