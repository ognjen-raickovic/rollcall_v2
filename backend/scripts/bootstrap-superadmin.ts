import pg from 'pg'
import { z } from 'zod'
import { pathToFileURL } from 'node:url'

export function bootstrapInput(args: string[], connection: string | undefined) {
  const target = args.find((arg) => arg.startsWith('--user-id='))?.slice(10)
  if (
    args.length !== 2 ||
    !args.includes('--confirm=INITIALIZE_LOCAL_SUPERADMIN') ||
    !z.uuid().safeParse(target).success
  )
    throw new Error('Supply --user-id=<confirmed-account-uuid> --confirm=INITIALIZE_LOCAL_SUPERADMIN.')
  let url: URL
  try {
    url = new URL(connection ?? '')
  } catch {
    throw new Error('A local maintenance database connection is required.')
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.search ||
    url.hash
  )
    throw new Error('Bootstrap accepts only literal loopback database addresses without URL options.')
  return { target: z.uuid().parse(target), connectionString: connection }
}
export async function bootstrapSuperadmin(args: string[], connection: string | undefined) {
  const input = bootstrapInput(args, connection)
  const db = new pg.Client({
    connectionString: input.connectionString,
    connectionTimeoutMillis: 5000,
  })
  try {
    await db.connect()
    await db.query('select private.bootstrap_superadmin($1::uuid)', [input.target])
  } finally {
    await db.end()
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrapSuperadmin(process.argv.slice(2), process.env.GEOGRAPHY_DATABASE_URL).then(
    () => console.log('Local superadmin initialized; an immutable audit entry was recorded.'),
    () => {
      console.error(
        'Bootstrap refused or unavailable. Check local configuration, confirmation, verified account and existing initialization. No credentials were printed.',
      )
      process.exitCode = 1
    },
  )
}
