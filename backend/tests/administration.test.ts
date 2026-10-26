import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { bootstrapInput } from '../scripts/bootstrap-superadmin.js'

test('bootstrap requires a UUID, explicit confirmation and literal local maintenance connection', () => {
  const args = [`--user-id=${randomUUID()}`, '--confirm=INITIALIZE_LOCAL_SUPERADMIN']
  assert.equal(Boolean(bootstrapInput(args, 'postgresql://operator@127.0.0.1:55322/postgres').target), true)
  for (const connection of [
    'postgres://operator@hosted.example/postgres',
    'postgres://operator@localhost/postgres',
    'postgres://operator@127.0.0.1/postgres?host=remote',
    'https://127.0.0.1/postgres',
    undefined,
  ])
    assert.throws(() => bootstrapInput(args, connection))
  assert.throws(() => bootstrapInput(args.slice(0, 1), 'postgres://operator@127.0.0.1/postgres'))
  assert.throws(() =>
    bootstrapInput(['--user-id=invalid', args[1] ?? ''], 'postgres://operator@127.0.0.1/postgres'),
  )
  assert.throws(() => bootstrapInput([...args, '--override'], 'postgres://operator@127.0.0.1/postgres'))
})
