import type { Client } from 'pg'

export async function bootstrapStagingAccount(client: Client, target: string) {
  await client.query('begin')
  try {
    await client.query("set local lock_timeout='10s'; set local statement_timeout='30s'")
    // Take the same exclusive role lock as bootstrap BEFORE reading live status.
    // Suspension takes its shared counterpart; each subsequent statement sees current state.
    await client.query('select pg_advisory_xact_lock($1,$2)', [82631, 51])
    const active = await client.query(
      "select not exists(select 1 from private.account_suspensions where profile_id=$1 and status='suspended') as active",
      [target],
    )
    if (!active.rows[0]?.active) throw new Error('A suspended account cannot be bootstrapped.')
    await client.query('select private.bootstrap_superadmin($1::uuid)', [target])
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}
