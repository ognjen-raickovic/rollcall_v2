import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import pg from 'pg'

// Explicit local maintenance only. Runtime requests never use this connection.
async function main(): Promise<void> {
  const connectionString = process.env.GEOGRAPHY_DATABASE_URL
  const projectOrigin = process.env.SUPABASE_URL
  if (!connectionString || !projectOrigin) throw new Error('Configure the local backend environment first.')
  const database = new URL(connectionString)
  const project = new URL(projectOrigin)
  const local = new Set(['localhost', '127.0.0.1', '[::1]'])
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !local.has(database.hostname) ||
    !['http:', 'https:'].includes(project.protocol) ||
    !local.has(project.hostname)
  )
    throw new Error('Event cover setup accepts local Supabase/PostgreSQL only.')

  const file = new URL('../.env', import.meta.url)
  const source = await readFile(file, 'utf8')
  const stored = /^EVENT_COVER_OPERATION_KEY=([^\r\n]*)$/m.exec(source)?.[1]?.trim()
  const supplied = process.env.EVENT_COVER_OPERATION_KEY
  if (stored && supplied && stored !== supplied)
    throw new Error('The local file and process have different image operation keys. Resolve this privately.')
  const key = supplied || stored || randomBytes(32).toString('base64url')
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(key)) throw new Error('Use a random base64url image operation key.')
  const digest = createHash('sha256').update(key).digest('hex')
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    application_name: 'rollcall-local-cover-setup',
  })
  try {
    await client.connect()
    await client.query('begin')
    const existing = await client.query<{ operation_key_hash: string }>(
      'select operation_key_hash from private.event_cover_config where singleton for update',
    )
    if (existing.rows[0] && existing.rows[0].operation_key_hash !== digest)
      throw new Error('The configured key does not match local Storage setup. No key was rotated.')
    await client.query(
      'insert into private.event_cover_config(singleton, operation_key_hash) values (true,$1) on conflict(singleton) do nothing',
      [digest],
    )
    if (!stored) {
      const line = `EVENT_COVER_OPERATION_KEY=${key}\n`
      const next = /^EVENT_COVER_OPERATION_KEY=.*$/m.test(source)
        ? source.replace(/^EVENT_COVER_OPERATION_KEY=.*(?:\r?\n|$)/m, line)
        : `${source}${source.endsWith('\n') ? '' : '\n'}\n# Server-only Storage operation capability; never expose in Vite.\n${line}`
      await writeFile(file, next, { mode: 0o600 })
    }
    await client.query('commit')
    console.log('Local event cover operation authorization configured. No credentials were printed.')
  } catch {
    await client.query('rollback').catch(() => {})
    throw new Error(
      'Local cover setup failed. Check pending migrations and private local configuration; existing keys were not rotated.',
    )
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Local cover setup failed.')
  process.exitCode = 1
})
