import { z } from 'zod'
import { HttpError, httpRequest } from '@/lib/http-client'
import { REPORT_REASONS, hasReportControls } from '@/lib/report-reasons'
import type { EventActionSession } from './event-write-dtos'
const inputSchema = z.strictObject({
  reason: z.enum(REPORT_REASONS),
  description: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => !hasReportControls(value, true), 'Remove unsupported control characters.'),
})
export type EventReportInput = z.infer<typeof inputSchema>
export async function submitEventReport(
  id: string,
  input: EventReportInput,
  session: EventActionSession,
  signal: AbortSignal,
) {
  const eventId = z.uuid().parse(id),
    parsed = inputSchema.safeParse(input),
    token = await session.getAccessToken()
  if (!parsed.success)
    throw new Error('Choose a reason and use at most 1000 characters without unsupported control characters.')
  const body = parsed.data
  if (!session.viewerId || !token) throw new HttpError(401, 'Log in to report an event.')
  const result = await httpRequest(
    `/api/events/${eventId}/reports`,
    z.object({ id: z.uuid(), created: z.boolean() }),
    { method: 'POST', token, viewerId:session.viewerId, body, signal, resource: 'event' },
  )
  if (!(await session.getAccessToken()) || signal.aborted) throw new Error('Your account changed. Try again.')
  return result
}
