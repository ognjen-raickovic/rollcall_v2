import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { build, createServer, preview } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { chromium, expect as baseExpect } from '@playwright/test'
const expect = baseExpect.configure({ timeout: 12000 })
const root = fileURLToPath(new URL('..', import.meta.url)),
  outDir = '.tmp/dashboard-menu-build'
const first = '46000000-0000-4000-8000-000000000001',
  second = '46000000-0000-4000-8000-000000000002'
test('Dashboard gate rejects stale, unverified, suspended, failed and mismatched identities', async () => {
  const server = await createServer({
    root,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  try {
    const { dashboardAccessAllowed: allowed } = await server.ssrLoadModule(
      '/src/features/users/api/use-dashboard-access.ts',
    )
    const value = {
      accountId: first,
      identityId: first,
      active: true,
      permissions: { role: 'admin', capabilities: { accessAdmin: true, manageAdminRoles: false } },
      pending: false,
      failed: false,
    }
    assert.equal(allowed(value), true)
    assert.equal(allowed({ ...value, permissions: { ...value.permissions, role: 'superadmin' } }), true)
    for (const patch of [
      { accountId: undefined },
      { accountId: 1, identityId: 1 },
      { identityId: second },
      { active: false },
      { pending: true },
      { failed: true },
      { permissions: undefined },
      { permissions: { ...value.permissions, role: 'user' } },
      { permissions: { ...value.permissions, capabilities: { accessAdmin: false, manageAdminRoles: true } } },
    ])
      assert.equal(allowed({ ...value, ...patch }), false)
  } finally {
    await server.close()
  }
})
test(
  'Dashboard account navigation revalidates current roles on desktop/mobile in both themes',
  { timeout: 150000 },
  async () => {
    await build({
      root,
      configFile: false,
      envDir: false,
      plugins: [react(), tailwindcss()],
      resolve: { alias: { '@': path.join(root, 'src') } },
      logLevel: 'error',
      build: { outDir, emptyOutDir: true },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic-dashboard.supabase.co'),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_synthetic_dashboard'),
        'import.meta.env.VITE_API_ORIGIN': JSON.stringify(''),
        'import.meta.env.VITE_ENABLE_DEMO_MODE': JSON.stringify('false'),
      },
    })
    const server = await preview({
      root,
      configFile: false,
      envDir: false,
      build: { outDir },
      preview: { host: '127.0.0.1', port: 0 },
    })
    let browser
    try {
      browser = await chromium.launch({
        headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      })
      await mkdir(path.join(root, '.tmp/dashboard-navigation'), { recursive: true })
      const origin = 'http://127.0.0.1:' + server.httpServer.address().port
      const user = (id) => ({
        id,
        email: 'fixture@example.test',
        aud: 'authenticated',
        role: 'authenticated',
        user_metadata: {},
        app_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      })
      const session = (id) => ({
        user: user(id),
        access_token: 'synthetic-dashboard-access',
        refresh_token: 'synthetic-dashboard-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      })
      for (const width of [375, 1440])
        for (const theme of ['dark', 'light']) {
          let role = 'admin',
            viewer = first,
            status = 'active',
            hold = false,
            release = () => {},
            gate = Promise.resolve(),
            permissionCalls = 0
          const context = await browser.newContext({ viewport: { width, height: 1000 } })
          await context.addInitScript(
            ({ theme, session }) => {
              localStorage.setItem('rollcall.theme', theme)
              localStorage.setItem('rollcall.auth', JSON.stringify(session))
            },
            { theme, session: session(first) },
          )
          const page = await context.newPage(),
            errors = []
          page.on('pageerror', (error) => errors.push(error.message))
          page.on('console', (message) => {
            if (message.type() === 'error' && !/Failed to load resource.*403/.test(message.text()))
              errors.push(message.text())
          })
          await page.route('**/*', async (route) => {
            const url = new URL(route.request().url()),
              p = url.pathname,
              json = (body, status = 200) =>
                route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
            if (p === '/auth/v1/user') return json(user(viewer))
            if (p === '/api/me') return json({ id: viewer, email: 'fixture@example.test' })
            if (p === '/api/me/account-status') return json({ status })
            if (p === '/api/me/permissions') {
              permissionCalls++
              if (hold) await gate
              if (status === 'suspended')
                return json({ code: 'ACCOUNT_SUSPENDED', message: 'Suspended', fields: {} }, 403)
              return json({
                role,
                capabilities: { accessAdmin: role !== 'user', manageAdminRoles: role === 'superadmin' },
              })
            }
            if (p.startsWith('/api/users/'))
              return json({
                id: viewer,
                displayName: viewer === first ? 'First account' : 'Second account',
                biography: null,
                country: null,
                city: null,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
                gameExperience: [],
              })
            if (p === '/api/countries' || p === '/api/cities' || p === '/api/games') return json([])
            if (p === '/api/events') return json({ items: [], pageInfo: { limit: 12, nextCursor: null } })
            if (p === '/api/admin/users' || p === '/api/admin/role-audit' || p === '/api/admin/event-reports')
              return json({ items: [], nextCursor: null })
            if (p.startsWith('/api/') || url.hostname.endsWith('.supabase.co')) return route.abort()
            return route.continue()
          })
          const mobile = width < 1280
          async function openAccount() {
            await page
              .getByRole('button', { name: mobile ? 'Open menu' : 'Account menu', exact: true })
              .click()
            return mobile ? page.getByRole('dialog', { name: 'Menu', exact: true }) : page.getByRole('menu')
          }
          const dashboard = () =>
            page.getByRole(mobile ? 'link' : 'menuitem', { name: 'Dashboard', exact: true })
          await page.goto(origin + '/about')
          await expect(page.getByRole('heading', { name: 'About RollCall', exact: true })).toBeVisible()
          await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
          if (!mobile)
            await expect(
              page.locator('header').getByRole('link', { name: 'Dashboard', exact: true }),
            ).toHaveCount(0)
          await openAccount()
          await expect(dashboard()).toBeVisible()
          await expect(dashboard()).toHaveAttribute('href', '/admin')
          await page.screenshot({
            path: path.join(root, `.tmp/dashboard-navigation/menu-${width}-${theme}.png`),
            animations: 'disabled',
          })
          await dashboard().focus()
          await page.keyboard.press('Enter')
          await expect(page).toHaveURL(origin + '/admin')
          await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible()
          // Existing protected views remain reachable; no dashboard redesign.
          await page.goto(origin + '/admin/reports')
          await expect(page.getByRole('heading', { name: 'Event reports', exact: true })).toBeVisible()
          await page.goto(origin + '/admin/accounts')
          await expect(page.getByRole('heading', { name: 'Account access', exact: true })).toBeVisible()
          await page.goto(origin + '/admin/users')
          await expect(page.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible()
          role = 'superadmin'
          await page.goto(origin + '/admin/users')
          await expect(
            page.getByRole('heading', { name: 'Manage administrators', exact: true }),
          ).toBeVisible()
          await page.goto(origin + '/admin/role-audit')
          await expect(page.getByRole('heading', { name: 'Role audit history', exact: true })).toBeVisible()
          await page.goto(origin + '/about')
          await openAccount()
          await expect(dashboard()).toBeVisible()
          await page.keyboard.press('Escape')
          // Opening with cached elevated permissions must hide Dashboard while revalidating.
          role = 'user'
          hold = true
          gate = new Promise((resolve) => {
            release = resolve
          })
          const before = permissionCalls
          await openAccount()
          await expect.poll(() => permissionCalls).toBeGreaterThan(before)
          await expect(dashboard()).toHaveCount(0)
          hold = false
          release()
          await expect(dashboard()).toHaveCount(0)
          await page.keyboard.press('Escape')
          await page.goto(origin + '/admin')
          await expect(page.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible()
          role = 'admin'
          await page.goto(origin + '/about')
          await openAccount()
          await expect(dashboard()).toBeVisible()
          // Switch to a different ordinary account without reloading the application.
          viewer = second
          role = 'user'
          await page.evaluate((session) => {
            localStorage.setItem('rollcall.auth', JSON.stringify(session))
            const channel = new BroadcastChannel('rollcall.auth')
            channel.postMessage({ event: 'SIGNED_IN', session })
            setTimeout(() => channel.close(), 100)
          }, session(second))
          await expect(dashboard()).toHaveCount(0)
          await page.keyboard.press('Escape')
          if (!mobile) {
            await expect(page.getByText('Welcome, Second account', { exact: true })).toBeVisible()
          }
          await openAccount()
          await expect(dashboard()).toHaveCount(0)
          await page.keyboard.press('Escape')
          role = 'admin'
          status = 'suspended'
          await openAccount()
          await expect(dashboard()).toHaveCount(0)
          await page.keyboard.press('Escape')
          await page.evaluate(() => {
            localStorage.removeItem('rollcall.auth')
            const channel = new BroadcastChannel('rollcall.auth')
            channel.postMessage({ event: 'SIGNED_OUT', session: null })
            setTimeout(() => channel.close(), 100)
          })
          if (mobile) {
            await openAccount()
            await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible()
          } else await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible()
          await expect(dashboard()).toHaveCount(0)
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          assert.deepEqual(errors, [])
          await context.close()
          console.log(
            `PASS: ${width}px ${theme}; admin/superadmin, routes, guest/user denial, pending/demotion/account switch/suspension`,
          )
        }
    } finally {
      await browser?.close()
      await new Promise((resolve) => server.httpServer.close(resolve))
    }
  },
)
