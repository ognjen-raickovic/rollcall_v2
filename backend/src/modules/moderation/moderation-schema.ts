import { z } from 'zod'
function hasControls(value: string, multiline: boolean) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return (code < 32 && !(multiline && [9, 10, 13].includes(code))) || code === 127
  })
}
export const reportReasonSchema = z.enum(['inappropriate', 'spam', 'harassment', 'unsafe', 'other'])
export const reportStatusSchema = z.enum(['open', 'dismissed', 'actioned'])
export const reportInputSchema = z.strictObject({
  reason: reportReasonSchema,
  description: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => !hasControls(value, true), 'Remove unsupported control characters.')
    .optional(),
})
export const decisionSchema = z.strictObject({
  note: z
    .string()
    .trim()
    .min(5)
    .max(500)
    .refine((value) => !hasControls(value, false), 'Use a short explanation on one line.'),
})
export const reportIdSchema = z.strictObject({ reportId: z.uuid() })
export const reportListSchema = z
  .strictObject({
    status: z.enum(['open', 'dismissed', 'actioned', 'all']).default('open'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    beforeTime: z.iso.datetime({ offset: true }).optional(),
    beforeId: z.uuid().optional(),
  })
  .refine((value) => Boolean(value.beforeTime) === Boolean(value.beforeId), 'Supply both cursor fields.')
export const reportSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  eventAvailable: z.boolean(),
  eventContext: z.object({
    title: z.string(),
    game: z.string(),
    startsAt: z.string(),
    visibility: z.enum(['public', 'unlisted', 'private']),
  }),
  eventStatus: z.enum(['scheduled', 'cancelled', 'completed']).nullable(),
  reason: reportReasonSchema,
  description: z.string().nullable(),
  status: reportStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolutionNote: z.string().nullable(),
})
export const reportDetailSchema = reportSchema.extend({
  history: z.array(
    z.object({
      id: z.string(),
      actorId: z.uuid(),
      action: z.enum(['dismiss', 'cancel_event']),
      previousStatus: z.literal('open'),
      newStatus: z.enum(['dismissed', 'actioned']),
      explanation: z.string(),
      eventChanged: z.boolean(),
      createdAt: z.string(),
    }),
  ),
})
export const reportPageSchema = z.object({
  items: z.array(reportSchema).max(50),
  nextCursor: z.object({ createdAt: z.string(), id: z.uuid() }).nullable(),
})
export const decisionResultSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  status: z.enum(['dismissed', 'actioned']),
  changed: z.boolean(),
})
