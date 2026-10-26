import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'
test.skip(process.env.RUN_LOCAL_ADMIN_UI !== 'true', 'Requires migrated local Supabase.')
test.use({ trace: 'off', screenshot: 'off' })
let db, root, admin, user
const ids = [],
  emails = [],
  password = `Rc!${randomUUID()}aA7`
async function api(path, actor, body) {
  return fetch(`http://127.0.0.1:3001/api${path}`, {
    method: body ? 'PATCH' : 'GET',
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
  if (
    (await db.query("select count(*)::int as n from private.account_roles where role='superadmin'")).rows[0]
      .n !== 0
  )
    throw Error('Refusing to change an existing superadmin configuration.')
  async function account(name) {
    const email = `admin-ui-${randomUUID()}@example.test`
    emails.push(email)
    const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth
    const result = await auth.signUp({ email, password, options: { data: { display_name: name } } }),
      id = result.data.user?.id
    if (!id) throw Error('Fixture registration failed')
    ids.push(id)
    await db.query('update public.profiles set display_name=$1 where id=$2', [name, id])
    const hash = (await db.query('select confirmation_token from auth.users where id=$1', [id])).rows[0]
      .confirmation_token
    const confirmed = await auth.verifyOtp({ token_hash: hash, type: 'signup' }),
      token = confirmed.data.session?.access_token
    if (!token) throw Error('Fixture confirmation failed')
    return { id, email, token }
  }
  root = await account('Workshop operator')
  admin = await account('Workshop administrator')
  user = await account('Workshop player')
  await db.query('select private.bootstrap_superadmin($1)', [root.id])
})
test.afterAll(async () => {
  if (!db) return
  try {
    await db.query('begin')
    await db.query("set local session_replication_role='replica'")
    await db.query('delete from private.role_audit where target_id=any($1::uuid[])', [ids])
    await db.query('commit')
    await db.query('delete from auth.users where email=any($1::text[])', [emails])
  } finally {
    await db.end()
  }
})
async function login(page, actor, target = '/admin') {
  await page.goto(`/login?returnTo=${encodeURIComponent(target)}`)
  await page.getByLabel('Email', { exact: true }).fill(actor.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${target}$`))
}
test('role management, audit, denied access, account switching and responsive states', async ({
  page,
  browser,
}, info) => {
  const errors = []
  page.on('pageerror', () => errors.push('page error'))
  await page.addInitScript(
    (theme) => localStorage.setItem('rollcall.theme', theme),
    info.project.metadata.theme,
  )
  await login(page, root, '/admin/users')
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toBeVisible()
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Workshop administrator', exact: true }) })
  await row.getByRole('button', { name: 'Promote to admin', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await dialog.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(row.getByRole('button', { name: 'Promote to admin', exact: true })).toBeFocused()
  await row.getByRole('button', { name: 'Promote to admin', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm role change', exact: true }).click()
  await expect(page.getByText('Role updated to admin.', { exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Demote to user', exact: true })).toBeVisible()
  await page.reload()
  await expect(row.getByRole('button', { name: 'Demote to user', exact: true })).toBeVisible()
  await page.getByLabel('Account UUID (optional)').fill(admin.id)
  await page.getByRole('button', { name: 'Find account', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Demote to user', exact: true })).toHaveCount(1)
  await page.screenshot({ path: info.outputPath('administration-users.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Role audit history', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'promote: user → admin', exact: true })).toBeVisible()
  const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:5173',
      viewport: info.project.use.viewport,
    }),
    p = await context.newPage()
  try {
    await login(p, admin)
    await expect(p.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible()
    await expect(p.getByRole('link', { name: 'Accounts and roles', exact: true })).toHaveCount(0)
    await p.goto('/admin/users')
    await expect(p.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible()
    expect((await api('/admin/users', admin)).status).toBe(403)
    expect((await api(`/admin/users/${user.id}/role`, admin, { role: 'admin' })).status).toBe(403)
    expect((await api(`/admin/users/${admin.id}/role`, root, { role: 'user' })).status).toBe(200)
    await p.goto('/admin')
    await expect(p.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible()
    await expect(p.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
  } finally {
    await context.close()
  }
  // Load/error/empty UI uses bounded transport fixtures; authorization above uses real APIs.
  await page.route('**/api/admin/users?*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Unavailable', fields: {} }),
    }),
  )
  await page.goto('/admin/users')
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await page.unroute('**/api/admin/users?*')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Workshop player', exact: true })).toBeVisible()
  await page.getByLabel('Account UUID (optional)').fill(randomUUID())
  await page.getByRole('button', { name: 'Find account', exact: true }).click()
  await expect(page.getByText('No confirmed accounts match this lookup.', { exact: true })).toBeVisible()
  let release, started
  const held = new Promise((resolve) => {
      release = resolve
    }),
    reached = new Promise((resolve) => {
      started = resolve
    })
  await page.route('**/api/admin/users?*', async (route) => {
    const response = await route.fetch()
    started()
    await held
    await route.fulfill({ response }).catch(() => {})
  })
  try {
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await reached
    await expect(page.getByText('Loading administration…', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Log out', exact: true }).click()
    await login(page, user, '/admin/users')
    release()
    await expect(page.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Workshop operator', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Promote to admin', exact: true })).toHaveCount(0)
  } finally {
    release()
    await page.unroute('**/api/admin/users?*')
  }
  expect(errors).toEqual([])
})
