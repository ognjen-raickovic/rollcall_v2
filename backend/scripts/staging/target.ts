import type { ClientConfig } from 'pg'

export type StagingAction = 'catalog' | 'geography' | 'provision-keys' | 'bootstrap'
export function stagingTarget(
  env: NodeJS.ProcessEnv,
  requestedRef: string | undefined,
  confirmation: string | undefined,
  action: StagingAction,
): ClientConfig {
  const ref = env.ROLLCALL_STAGING_PROJECT_REF
  if (
    env.ROLLCALL_STAGING_PROJECT_NAME !== 'rollcall-dev' ||
    !ref ||
    !/^[a-z0-9]{20}$/.test(ref) ||
    requestedRef !== ref
  )
    throw new Error('Select the independently reviewed rollcall-dev staging project reference.')
  if (env.ROLLCALL_STAGING_WRITES_ENABLED !== 'true' || confirmation !== `staging:${ref}:${action}`)
    throw new Error('Staging writes require the operator enable flag and action-specific confirmation.')
  let project: URL, database: URL
  try {
    project = new URL(env.ROLLCALL_STAGING_SUPABASE_URL ?? '')
    database = new URL(env.ROLLCALL_STAGING_DATABASE_URL ?? '')
  } catch {
    throw new Error('Configure the isolated staging project and maintenance connection privately.')
  }
  if (
    project.href !== `https://${ref}.supabase.co/` ||
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    database.search ||
    database.hash ||
    database.pathname !== '/postgres' ||
    (database.port && database.port !== '5432')
  )
    throw new Error(
      'Use the approved hosted origin and direct/session PostgreSQL connection without URI options.',
    )
  const user = decodeURIComponent(database.username),
    password = decodeURIComponent(database.password)
  const direct = database.hostname === `db.${ref}.supabase.co` && user === 'postgres'
  const pooler =
    /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(database.hostname) && user === `postgres.${ref}`
  if ((!direct && !pooler) || !password)
    throw new Error(
      'Database host/user must identify the approved staging project; transaction poolers are refused.',
    )
  // Construct explicitly: pg URI sslmode/host options cannot override TLS verification.
  return {
    host: database.hostname,
    port: 5432,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    application_name: 'rollcall-staging-operator',
    query_timeout: 180000,
  }
}
