import { randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import type { Client } from 'pg'
export const stagingSecretsFile = new URL('../../.staging/server-secrets.env', import.meta.url)
export async function generateStagingKeys(file: URL = stagingSecretsFile) {
  await mkdir(new URL('./', file), { recursive: true })
  const content = `EVENT_COVER_OPERATION_KEY=${randomBytes(32).toString('base64url')}\nEVENT_INVITATION_KEY=${randomBytes(32).toString('base64url')}\n`
  // Never overwrite an existing root, even if it appears invalid.
  await writeFile(file, content, { flag: 'wx', mode: 0o600 })
}
export async function readStagingKeys(file: URL = stagingSecretsFile) {
  const source = await readFile(file, 'utf8'),
    lines = source.trim().split(/\r?\n/)
  if (lines.length !== 2)
    throw new Error('Use the independently generated staging key file; existing material was not changed.')
  const cover = /^EVENT_COVER_OPERATION_KEY=([A-Za-z0-9_-]{43})$/.exec(lines[0] ?? '')?.[1]
  const invitation = /^EVENT_INVITATION_KEY=([A-Za-z0-9_-]{43})$/.exec(lines[1] ?? '')?.[1]
  if (!cover || !invitation || cover === invitation)
    throw new Error('Invalid staging key file; no credentials are included in diagnostics.')
  return { cover, invitation }
}
export async function provisionStagingKeys(client: Client, keys: { cover: string; invitation: string }) {
  const cover = createHash('sha256').update(keys.cover).digest('hex')
  const invitation = createHash('sha256')
    .update('rollcall-staging-invitation-v1:')
    .update(keys.invitation)
    .digest('hex')
  await client.query('begin')
  try {
    await client.query("set local lock_timeout='10s'; set local statement_timeout='30s'")
    const existing = await client.query<{
      cover_key_fingerprint: string
      invitation_key_fingerprint: string
    }>(
      'select cover_key_fingerprint,invitation_key_fingerprint from private.staging_provisioning where singleton for update',
    )
    const stored = await client.query<{ operation_key_hash: string }>(
      'select operation_key_hash from private.event_cover_config where singleton for update',
    )
    const row = existing.rows[0]
    if (
      (row && (row.cover_key_fingerprint !== cover || row.invitation_key_fingerprint !== invitation)) ||
      (stored.rows[0] && stored.rows[0].operation_key_hash !== cover)
    )
      throw new Error(
        'Staging keys conflict with prior provisioning; rotation requires a separate reviewed procedure.',
      )
    await client.query(
      'insert into private.event_cover_config(singleton,operation_key_hash) values(true,$1) on conflict(singleton) do nothing',
      [cover],
    )
    await client.query(
      "insert into private.staging_provisioning(singleton,environment,cover_key_fingerprint,invitation_key_fingerprint) values(true,'staging',$1,$2) on conflict(singleton) do nothing",
      [cover, invitation],
    )
    await client.query('commit')
    return { configured: true, alreadyProvisioned: Boolean(row) }
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}
