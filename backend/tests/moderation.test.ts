import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  reportInputSchema,
  decisionSchema,
  reportListSchema,
} from '../src/modules/moderation/moderation-schema.js'
test('reports and moderation decisions have bounded strict contracts', () => {
  assert.deepEqual(reportInputSchema.parse({ reason: 'unsafe', description: '  A concerning event.  ' }), {
    reason: 'unsafe',
    description: 'A concerning event.',
  })
  for (const input of [
    { reason: 'unknown' },
    { reason: 'other', reporterId: 'forged' },
    { reason: 'other', description: 'x'.repeat(1001) },
    { reason: 'spam', description: 'bad\u0001input' },
  ])
    assert.equal(reportInputSchema.safeParse(input).success, false)
  assert.equal(
    reportInputSchema.safeParse({ reason: 'other', description: 'First line\nSecond line' }).success,
    true,
  )
  for (const input of [
    { note: 'bad' },
    { note: 'valid note', eventId: 'arbitrary' },
    { note: 'x'.repeat(501) },
  ])
    assert.equal(decisionSchema.safeParse(input).success, false)
  for (const input of [
    { limit: 51 },
    { status: 'unknown' },
    { beforeId: '11111111-1111-4111-8111-111111111111' },
  ])
    assert.equal(reportListSchema.safeParse(input).success, false)
})
