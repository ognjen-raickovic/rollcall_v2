import { z } from 'zod'
import { HttpError, httpRequest } from '@/lib/http-client'
import { REPORT_REASONS, hasReportControls } from '@/lib/report-reasons'
import { authApi } from './auth-api'
export type ReportStatus = 'open' | 'dismissed' | 'actioned' | 'all'
export type ReportCursor = { createdAt: string; id: string }
const report = z.object({
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
  reason: z.enum(REPORT_REASONS),
  description: z.string().nullable(),
  status: z.enum(['open', 'dismissed', 'actioned']),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolutionNote: z.string().nullable(),
})
const detail = report.extend({
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
async function request<T>(
  viewer: string,
  path: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
  body?: unknown,
) {
  const token = await authApi.accessToken(viewer)
  if (!token) throw new HttpError(401, 'Log in to continue.')
  try {
    const result = await httpRequest(path, schema, {
      token,
      signal,
      method: body === undefined ? 'GET' : 'POST',
      body,
      resource: 'event',
    })
    if (!(await authApi.accessToken(viewer)) || signal.aborted)
      throw new Error('Your account changed. Try again.')
    return result
  } catch (error) {
    if (error instanceof HttpError && error.status === 403)
      throw new HttpError(403, 'Your account no longer has moderation access. Refresh your permissions.')
    if (error instanceof HttpError && error.status === 409)
      throw new HttpError(
        409,
        'This report is resolved or its event was deleted. Refresh the report before deciding.',
      )
    if (error instanceof HttpError && error.status === 404)
      throw new HttpError(404, 'This report is no longer available.')
    throw error
  }
}
export const moderationApi = {
  list: (viewer: string, status: ReportStatus, cursor: ReportCursor | null, signal: AbortSignal) => {
    const query = new URLSearchParams({ status, limit: '20' })
    if (cursor) {
      query.set('beforeTime', cursor.createdAt)
      query.set('beforeId', cursor.id)
    }
    return request(
      viewer,
      `/api/admin/event-reports?${query}`,
      z.object({
        items: z.array(report),
        nextCursor: z.object({ createdAt: z.string(), id: z.uuid() }).nullable(),
      }),
      signal,
    )
  },
  get: (viewer: string, id: string, signal: AbortSignal) =>
    request(viewer, `/api/admin/event-reports/${z.uuid().parse(id)}`, detail, signal),
  decide: (
    viewer: string,
    id: string,
    action: 'dismiss' | 'take-action',
    note: string,
    signal: AbortSignal,
  ) => {
    if (note.trim().length < 5 || note.trim().length > 500 || hasReportControls(note, false))
      throw new Error('Use a short explanation of 5–500 characters on one line.')
    return request(
      viewer,
      `/api/admin/event-reports/${z.uuid().parse(id)}/${action}`,
      z.object({
        id: z.uuid(),
        eventId: z.uuid(),
        status: z.enum(['dismissed', 'actioned']),
        changed: z.boolean(),
      }),
      signal,
      { note: note.trim() },
    )
  },
}
