// Real local PostgreSQL transactions; never connects to a remote project.
// Start/reset the local Supabase stack first. Requires Docker's CLI, not a JS DB driver.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

const container = process.env.ROLLCALL_TEST_CONTAINER ?? 'supabase_db_rollcall'
assert.ok(['supabase_db_rollcall', 'rollcall-migration-check'].includes(container), 'Only a known local test container is supported.')
const eventId = randomUUID()
const hostId = randomUUID()
const firstPlayerId = randomUUID()
const secondPlayerId = randomUUID()
const applicationPrefix = `rollcall-race-${randomUUID()}`
const clients = new Set()

function openSql(applicationName = applicationPrefix) {
  const child = spawn('docker', [
    'exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-A', '-t',
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  clients.add(child)
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
  child.stdin.on('error', () => { /* A failed Docker process is reported through its exit code. */ })
  // Fixture IDs and application names are generated internally; no user input or secrets.
  child.stdin.write(`set application_name = '${applicationName}'; set statement_timeout = '15s';\n`)
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      clients.delete(child)
      resolve({ code, stdout, stderr })
    })
  })
  return { child, completion, output: () => stdout }
}

async function sql(query) {
  const connection = openSql()
  connection.child.stdin.end(`${query}\n`)
  const result = await connection.completion
  assert.equal(result.code, 0, `Local SQL command failed: ${result.stderr}`)
  return result.stdout.trim().split(/\r?\n/).filter((line) => line !== 'SET').join('\n')
}

async function waitUntil(check, label) {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(50)
  }
  throw new Error(`Timed out waiting for ${label}.`)
}

async function race(firstStatement, secondStatement, label) {
  const first = openSql(`${applicationPrefix}-first`)
  // Keep this transaction open until PostgreSQL confirms the second writer is blocked.
  first.child.stdin.write(`begin; ${firstStatement};\n\\echo FIRST_RESERVED\n`)
  await waitUntil(() => first.output().includes('FIRST_RESERVED'), 'first transaction reservation')
  const secondApplication = `${applicationPrefix}-second`
  const second = openSql(secondApplication)
  second.child.stdin.end(`begin; ${secondStatement}; commit;\n`)
  await waitUntil(async () => (await sql(`select exists (
    select 1 from pg_stat_activity where application_name = '${secondApplication}' and wait_event_type = 'Lock'
  );`)).endsWith('t'), 'second transaction to wait for the event row lock')
  first.child.stdin.end('commit;\n')
  const [firstResult, secondResult] = await Promise.all([first.completion, second.completion])
  assert.equal(firstResult.code, 0, firstResult.stderr)
  assert.notEqual(secondResult.code, 0, `${label}: second writer should be rejected`)
  assert.match(secondResult.stderr, /Event is full|check constraint/, secondResult.stderr)
  console.log(`PASS ${label}: second transaction waited for the event lock, then failed safely.`)
}

try {
  await sql(`begin;
    insert into auth.users(id) values ('${hostId}'), ('${firstPlayerId}'), ('${secondPlayerId}');
    insert into public.profiles(id, display_name) values
      ('${hostId}', 'Concurrency host fixture'), ('${firstPlayerId}', 'Concurrency player one'),
      ('${secondPlayerId}', 'Concurrency player two');
    insert into public.events(id, host_id, game_id, city_id, title, description, starts_at, ends_at,
      capacity, experience_level)
    select '${eventId}', '${hostId}', (select min(id) from public.games),
      (select min(id) from public.cities), 'Concurrency test fixture',
      'Temporary local-only concurrency test; automatically removed.',
      now() + interval '1 day', now() + interval '1 day 2 hours', 1, 'all-levels';
    insert into private.event_locations(event_id, address) values ('${eventId}', 'Private concurrency fixture');
    commit;`)

  await race(
    `insert into public.event_participants(event_id, profile_id) values ('${eventId}', '${firstPlayerId}')`,
    `insert into public.event_participants(event_id, profile_id) values ('${eventId}', '${secondPlayerId}')`,
    'two players competing for the final seat',
  )
  assert.equal(await sql(`select participant_count from public.events where id = '${eventId}';`), '1')
  assert.equal(await sql(`select count(*) from public.event_participants where event_id = '${eventId}';`), '1')

  await sql(`update public.events set capacity = 2 where id = '${eventId}';`)
  await race(
    `insert into public.event_participants(event_id, profile_id) values ('${eventId}', '${secondPlayerId}')`,
    `update public.events set capacity = 1 where id = '${eventId}'`,
    'joining while the host reduces capacity',
  )
  assert.equal(await sql(`select participant_count || '/' || capacity from public.events where id = '${eventId}';`), '2/2')
  assert.equal(await sql(`select count(*) from public.event_participants where event_id = '${eventId}';`), '2')
} finally {
  for (const client of clients) client.kill()
  try {
    await sql(`select pg_terminate_backend(pid) from pg_stat_activity
      where application_name in ('${applicationPrefix}-first', '${applicationPrefix}-second');`)
    await sql(`begin; delete from public.events where id = '${eventId}';
      delete from auth.users where id in ('${hostId}', '${firstPlayerId}', '${secondPlayerId}'); commit;`)
  } catch (error) {
    console.error('Local fixture cleanup could not complete:', error.message)
    process.exitCode = 1
  }
}
