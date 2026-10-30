import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { validateVercelConfig, validateFrontendEnvironment } from './check-hosting-config.mjs'

const root = new URL('../', import.meta.url)
const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'))
const frontendRequire = createRequire(new URL('frontend/package.json', root))

test('hosting configuration preserves API prefix, blocks unconfigured origins and keeps private inputs excluded', async () => {
  const current = validateVercelConfig(config, true)
  assert.equal(current.configured, true)
  assert.equal(current.origin, 'https://rollcall-v2.onrender.com')
  const placeholder = structuredClone(config)
  for (const rule of placeholder.rewrites.slice(0, 3))
    rule.destination = rule.destination.replace(current.origin, 'https://rollcall-api.invalid')
  assert.equal(validateVercelConfig(placeholder).configured, false)
  assert.throws(() => validateVercelConfig(placeholder, true))
  const configured = structuredClone(config)
  for (const rule of configured.rewrites.slice(0, 3))
    rule.destination = rule.destination.replace(current.origin, 'https://synthetic-api.onrender.com')
  assert.equal(validateVercelConfig(configured, true).configured, true)
  const apiHeaders = config.headers.find(rule => rule.source === '/api/:path*')?.headers
  for (const key of ['Cache-Control', 'CDN-Cache-Control'])
    assert.ok(apiHeaders?.some(header => header.key === key && header.value === 'no-store'))
  const broken = structuredClone(configured)
  broken.rewrites[2].destination = 'https://synthetic-api.onrender.com/:path*'
  assert.throws(() => validateVercelConfig(broken, true))
  broken.rewrites.reverse()
  assert.throws(() => validateVercelConfig(broken, true))
  const render = await readFile(new URL('render.yaml', root), 'utf8')
  assert.match(render, /maintenanceMode:\s*\n\s+enabled: true/)
  assert.match(render, /autoDeployTrigger: off/)
  assert.match(render, /healthCheckPath: \/health/)
  const uploadRules = await readFile(new URL('.vercelignore', root), 'utf8')
  for (const rule of ['**/.env', '**/.env.*', '**/.staging/**', '**/.tmp/**', '**/.geography/**'])
    assert.ok(uploadRules.split(/\r?\n/).includes(rule))
  // Inspect index path metadata only; never open ignored/private files.
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: fileURLToPath(root),
    encoding: 'utf8',
  }).split('\0')
  assert.equal(
    tracked.some(
      (path) =>
        path.startsWith('backend/.staging/') ||
        (/(^|\/)\.env($|\.)/.test(path) && !path.endsWith('.example')),
    ),
    false,
  )
})

test('hosted browser settings refuse privileged keys, extra secrets, demo mode and direct cross-origin API calls', () => {
  const publicEnv = {
    VITE_API_ORIGIN: '',
    VITE_ENABLE_DEMO_MODE: 'false',
    VITE_SUPABASE_URL: 'https://synthetic-hosting.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_fixture',
  }
  validateFrontendEnvironment(publicEnv)
  for (const change of [
    { VITE_ENABLE_DEMO_MODE: 'true' },
    { VITE_API_ORIGIN: 'https://synthetic-api.onrender.com' },
    { VITE_SUPABASE_URL: 'http://127.0.0.1:55321' },
    { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_synthetic' },
    { VITE_DATABASE_PASSWORD: 'synthetic' },
    { VITE_VERCEL_SERVICE_ROLE_KEY: 'synthetic' },
    {
      VITE_SUPABASE_PUBLISHABLE_KEY: `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`,
    },
  ])
    assert.throws(() => validateFrontendEnvironment({ ...publicEnv, ...change }))
})

test(
  'compiled production API binds the supplied port, returns liveness and denies missing authentication',
  { timeout: 25000 },
  async () => {
    const reservation = createServer()
    reservation.listen(0, '127.0.0.1')
    await once(reservation, 'listening')
    const port = reservation.address().port
    await new Promise((resolve) => reservation.close(resolve))
    const operatingSystemEnv = Object.fromEntries(
      [
        'PATH',
        'SystemRoot',
        'WINDIR',
        'USERPROFILE',
        'HOMEDRIVE',
        'HOMEPATH',
        'TEMP',
        'TMP',
        'APPDATA',
        'LOCALAPPDATA',
      ]
        .filter((name) => process.env[name] !== undefined)
        .map((name) => [name, process.env[name]]),
    )
    const child = spawn(process.execPath, ['backend/dist/server.js'], {
      cwd: fileURLToPath(root),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...operatingSystemEnv,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(port),
        LOG_LEVEL: 'info',
        SUPABASE_URL: 'https://synthetic-hosting.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_fixture',
      },
    })
    let diagnostics = ''
    child.stderr.on('data', (chunk) => {
      diagnostics += chunk.toString()
    })
    child.stdout.on('data', (chunk) => {
      diagnostics += chunk.toString()
    })
    const origin = `http://127.0.0.1:${port}`
    try {
      let ready = false
      for (let attempt = 0; attempt < 100; attempt++) {
        if (child.exitCode !== null) break
        try {
          ready = (await fetch(`${origin}/health`, { signal: AbortSignal.timeout(300) })).ok
        } catch {
          /* Waiting only for local process startup. */
        }
        if (ready) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      assert.equal(
        ready,
        true,
        `Compiled API startup failed: ${diagnostics || 'No startup diagnostics; process did not become ready within the startup deadline.'}`,
      )
      assert.deepEqual(await (await fetch(`${origin}/health`)).json(), {
        status: 'ok',
        service: 'rollcall-api',
      })
      assert.equal((await fetch(`${origin}/api/me`)).status, 401)
    } finally {
      if (child.exitCode === null) {
        const ended = once(child, 'exit')
        child.kill()
        await ended
      }
    }
  },
)

test(
  'production preview preserves API method/query/bearer/multipart and serves SPA deep links',
  { timeout: 15000 },
  async () => {
    const upstream = createServer(async (request, response) => {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      response.writeHead(request.url.startsWith('/api/missing') ? 404 : 200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      response.end(
        JSON.stringify({
          method: request.method,
          url: request.url,
          authorization: request.headers.authorization,
          contentType: request.headers['content-type'],
          body: Buffer.concat(chunks).toString(),
        }),
      )
    })
    upstream.listen(0, '127.0.0.1')
    await once(upstream, 'listening')
    const previous = process.env.API_PROXY_TARGET
    process.env.API_PROXY_TARGET = `http://127.0.0.1:${upstream.address().port}`
    let server
    try {
      const { preview } = await import(pathToFileURL(frontendRequire.resolve('vite')).href)
      server = await preview({
        root: fileURLToPath(new URL('frontend/', root)),
        configFile: fileURLToPath(new URL('frontend/vite.config.ts', root)),
        preview: { host: '127.0.0.1', port: 0 },
      })
      const origin = `http://127.0.0.1:${server.httpServer.address().port}`
      for (const path of ['/events/synthetic-id', '/auth/callback?code=synthetic', '/reset-password']) {
        const response = await fetch(origin + path)
        assert.equal(response.status, 200)
        assert.match(await response.text(), /id="root"/)
      }
      const form = new FormData()
      form.set('file', new Blob(['synthetic-image']), 'fixture.webp')
      const result = await (
        await fetch(`${origin}/api/events/synthetic/cover?check=1`, {
          method: 'POST',
          headers: { Authorization: 'Bearer synthetic-test-token' },
          body: form,
        })
      ).json()
      assert.equal(result.method, 'POST')
      assert.equal(result.url, '/api/events/synthetic/cover?check=1')
      assert.equal(result.authorization, 'Bearer synthetic-test-token')
      assert.match(result.contentType, /^multipart\/form-data; boundary=/)
      assert.ok(result.body.includes('synthetic-image'))
      const missing = await fetch(`${origin}/api/missing`)
      assert.equal(missing.status, 404)
      assert.match(missing.headers.get('content-type'), /application\/json/)
    } finally {
      if (previous === undefined) delete process.env.API_PROXY_TARGET
      else process.env.API_PROXY_TARGET = previous
      if (server) {
        server.httpServer.closeAllConnections()
        await new Promise((resolve) => server.httpServer.close(resolve))
      }
      upstream.closeAllConnections()
      await new Promise((resolve) => upstream.close(resolve))
    }
  },
)
