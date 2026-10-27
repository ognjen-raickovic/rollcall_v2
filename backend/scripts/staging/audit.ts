import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
export const repositoryRoot = new URL('../../../', import.meta.url)
export async function migrationAudit(root: URL = repositoryRoot) {
  const directory = new URL('supabase/migrations/', root),
    files = (await readdir(directory)).filter((file) => /^\d{14}_[a-z0-9_]+\.sql$/.test(file)).sort()
  const migrations = []
  const managedAuthDelegations: string[] = []
  for (const file of files) {
    const source = await readFile(new URL(file, directory))
    migrations.push({ file, sha256: createHash('sha256').update(source).digest('hex') })
    const sql = source.toString('utf8').replace(/--[^\r\n]*/g, '')
    if (
      /\bgrant\s+(?!option\b)[^;]*\bon\s+schema\b[^;]*\bauth\b/i.test(sql) ||
      /\bgrant\s+(?!option\b)[^;]*\bon\s+(?:(?:function|table)\s+)?auth\./i.test(sql)
    )
      managedAuthDelegations.push(file)
  }
  const blockers: string[] = []
  for (const file of managedAuthDelegations)
    blockers.push(`Unsupported managed Auth delegation in ${file}; use the restricted private helpers.`)
  if (!files.includes('20261026000600_account_suspensions.sql'))
    blockers.push(
      'Milestone 5B-2B migration is missing from this branch; integrate the reviewed milestone before any staging write.',
    )
  for (const path of ['backend/src/modules/auth/account-status.ts', 'docs/account-suspensions.md']) {
    try {
      await readFile(new URL(path, root))
    } catch {
      blockers.push(`Required 5B-2B deliverable missing: ${path}`)
    }
  }
  const app = await readFile(new URL('backend/src/app.ts', root), 'utf8')
  if (!app.includes('registerSuspensionRoutes'))
    blockers.push('Fastify suspension enforcement is absent from the rollout source.')
  return { readyForRollout: blockers.length === 0, migrations, blockers }
}
