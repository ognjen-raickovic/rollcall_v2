import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { invitationCrypto, normalizeInvitation } from '../src/modules/events/event-invitations.js'

test('invitation codes use canonical 80-bit material and authenticated event-bound encryption', () => {
  const crypto = invitationCrypto(randomBytes(32).toString('base64url')),
    id = randomUUID()
  const code = crypto.generate(),
    sealed = crypto.seal(code, id)
  assert.equal(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16}$/.test(code), true)
  assert.equal(normalizeInvitation('2345-6789 abcd efgh'), '23456789ABCDEFGH')
  assert.equal(crypto.open(sealed, id) === code, true)
  assert.equal(sealed.includes(code), false)
  assert.equal(crypto.hash(code).length, 64)
  assert.throws(() => crypto.open(sealed, randomUUID()))
  assert.throws(() => crypto.open(sealed.slice(0, -2) + '00', id))
  assert.throws(() => normalizeInvitation('invalid'))
})
