import { z } from 'zod'
import type { DatabaseClient } from '../../db/supabase.js'
import { ApiError } from '../../shared/api-error.js'
import {
  decisionResultSchema,
  reportDetailSchema,
  reportPageSchema,
  type reportListSchema,
  type reportInputSchema,
} from './moderation-schema.js'
function result<T>(value: { data: unknown; error: { code?: string } | null }, schema: z.ZodType<T>): T {
  if (value.error) {
    if (value.error.code === '42501')
      throw new ApiError(403, 'FORBIDDEN', 'You do not have permission for this action.')
    if (value.error.code === 'P0002') throw new ApiError(404, 'NOT_FOUND', 'Report not found.')
    if (value.error.code === '22023')
      throw new ApiError(400, 'VALIDATION_ERROR', 'Check the report or moderation decision.')
    if (value.error.code === 'P0001')
      throw new ApiError(
        409,
        'CONFLICT',
        'The report is already resolved or the event was deleted. Refresh and review its current state.',
      )
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Reporting and moderation are temporarily unavailable.')
  }
  const parsed = schema.safeParse(value.data)
  if (!parsed.success)
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Reporting and moderation are temporarily unavailable.')
  return parsed.data
}
export function createModerationRepository(client: DatabaseClient) {
  return {
    submit: async (eventId: string, input: z.infer<typeof reportInputSchema>) => {
      const outcome = result(
        await client.rpc('submit_event_report', {
          p_event_id: eventId,
          p_reason: input.reason,
          p_description: input.description || null,
        }),
        z.discriminatedUnion('status', [
          z.object({ status: z.literal('accepted'), id: z.uuid(), created: z.boolean() }),
          z.object({ status: z.literal('limited') }),
          z.object({ status: z.literal('unavailable') }),
        ]),
      )
      if (outcome.status === 'limited')
        throw new ApiError(429, 'RATE_LIMITED', 'Too many reports. Try again in 15 minutes.')
      if (outcome.status !== 'accepted') throw new ApiError(404, 'NOT_FOUND', 'Event not found.')
      return { id: outcome.id, created: outcome.created }
    },
    list: async (query: z.infer<typeof reportListSchema>) =>
      result(
        await client.rpc('list_event_reports', {
          p_status: query.status,
          p_limit: query.limit,
          ...(query.beforeTime ? { p_before_time: query.beforeTime, p_before_id: query.beforeId } : {}),
        }),
        reportPageSchema,
      ),
    get: async (id: string) =>
      result(await client.rpc('get_event_report', { p_report_id: id }), reportDetailSchema),
    resolve: async (id: string, action: 'dismiss' | 'cancel_event', note: string) =>
      result(
        await client.rpc('resolve_event_report', { p_report_id: id, p_action: action, p_note: note }),
        decisionResultSchema,
      ),
  }
}
