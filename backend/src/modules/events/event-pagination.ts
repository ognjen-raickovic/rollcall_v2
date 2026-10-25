import { z } from 'zod'

const cursorPositionSchema = z.strictObject({
  startsAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
})

export const eventCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use a valid event cursor.')
  .transform((value, context) => {
    try {
      const bytes = Buffer.from(value, 'base64url')
      if (bytes.toString('base64url') !== value) throw new Error('Noncanonical cursor')
      const decoded: unknown = JSON.parse(bytes.toString('utf8'))
      const parsed = cursorPositionSchema.safeParse(decoded)
      if (parsed.success) return parsed.data
    } catch {
      // Cursors contain a public ordering position, never a trusted identity or SQL text.
    }
    context.addIssue({ code: 'custom', message: 'Use a valid event cursor.' })
    return z.NEVER
  })

export function encodeEventCursor(position: { startsAt: string; id: string }): string {
  // Preserve PostgreSQL timestamp precision rather than rounding through a JavaScript Date.
  return Buffer.from(JSON.stringify({ startsAt: position.startsAt, id: position.id })).toString('base64url')
}
