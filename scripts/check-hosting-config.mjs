import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export function validateVercelConfig(config, requireConfigured = false) {
  const fail = () => {
    throw new Error('Invalid hosting configuration; review vercel.json and docs/application-hosting.md.')
  }
  let origin
  try {
    const destination = new URL(config.rewrites?.[0]?.destination)
    if (
      destination.protocol !== 'https:' ||
      destination.username ||
      destination.password ||
      destination.search ||
      destination.hash
    )
      fail()
    origin = destination.origin
    if (
      requireConfigured &&
      (!destination.hostname.endsWith('.onrender.com') || destination.hostname.includes('replace-'))
    )
      fail()
    if (
      !requireConfigured &&
      destination.hostname !== 'rollcall-api.invalid' &&
      !destination.hostname.endsWith('.onrender.com')
    )
      fail()
  } catch {
    fail()
  }
  const expected = [
    { source: '/api/health', destination: `${origin}/health` },
    { source: '/api', destination: `${origin}/api` },
    { source: '/api/:path*', destination: `${origin}/api/:path*` },
    { source: '/(.*)', destination: '/index.html' },
  ]
  if (
    JSON.stringify(config.rewrites) !== JSON.stringify(expected) ||
    config.git?.deploymentEnabled !== false ||
    config.outputDirectory !== 'frontend/dist'
  )
    fail()
  if (
    config.headers?.some((rule) =>
      rule.headers?.some((header) => header.key.toLowerCase() === 'x-vercel-enable-rewrite-caching'),
    )
  )
    fail()
  return { origin, configured: origin !== 'https://rollcall-api.invalid' }
}

export function validateFrontendEnvironment(env) {
  const allowed = new Set([
    'VITE_API_ORIGIN',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_ENABLE_DEMO_MODE',
  ])
  for (const name of Object.keys(env).filter((name) => name.startsWith('VITE_'))) {
    const publicPlatformMetadata =
      name.startsWith('VITE_VERCEL_') && !/SECRET|PASSWORD|TOKEN|KEY|DATABASE/.test(name)
    if (!allowed.has(name) && !publicPlatformMetadata)
      throw new Error('Unexpected browser environment variable; configure only the documented public values.')
  }
  if ((env.VITE_API_ORIGIN ?? '').trim() !== '' || env.VITE_ENABLE_DEMO_MODE !== 'false')
    throw new Error('Hosted builds require same-origin API requests and demo mode explicitly disabled.')
  try {
    const url = new URL(env.VITE_SUPABASE_URL ?? '')
    if (
      url.protocol !== 'https:' ||
      !url.hostname.endsWith('.supabase.co') ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error()
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return
    const claims = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString())
    if (claims.role !== 'anon') throw new Error()
  } catch {
    throw new Error(
      'Configure the hosted Supabase origin and only its publishable/legacy anon key. Rejected values are not printed.',
    )
  }
}

export async function checkHosting(deployment = false) {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const result = validateVercelConfig(config, deployment)
  if (deployment) validateFrontendEnvironment(process.env)
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkHosting(process.argv.includes('--deployment'))
    .then((result) => {
      console.log(
        result.configured
          ? 'Hosting routing configuration is valid; deployment/security approval is still required.'
          : 'Hosting template is valid. Replace the reserved .invalid API origin with the approved Render origin before a hosting build.',
      )
    })
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
