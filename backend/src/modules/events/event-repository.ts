import { z, type ZodType } from 'zod'
import type { DatabaseClient } from '../../db/supabase.js'
import { ApiError } from '../../shared/api-error.js'
import {
  attendanceResultSchema,
  databaseEventDetailsSchema,
  databaseEventPageSchema,
  hostEventDetailsSchema,
  participantEventDetailsSchema,
  publicEventDetailsSchema,
} from './event-schema.js'
import { encodeEventCursor } from './event-pagination.js'
import type { AttendanceResult, EventRepository, HostEventDetails } from './types.js'

type DatabaseError = { code: string }

export function eventNotFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'This event does not exist.')
}

function unavailable(): ApiError {
  return new ApiError(
    503,
    'DEPENDENCY_UNAVAILABLE',
    'Event data is temporarily unavailable. Try again shortly.',
  )
}

function databaseError(error: DatabaseError): ApiError {
  if (error.code === 'P0002') return eventNotFound()
  if (error.code === 'RA001')
    return new ApiError(
      409,
      'CONFLICT',
      'Attendance is only available for scheduled events that have not started.',
    )
  if (error.code === 'RA002')
    return new ApiError(409, 'CONFLICT', 'Hosts cannot join or leave their own event as a participant.')
  if (error.code === 'RA003') return new ApiError(409, 'CONFLICT', 'This event is full.')
  if (error.code === 'PT409')
    return new ApiError(409, 'CONFLICT', 'Capacity cannot be lower than current attendance.', {
      capacity: ['Keep at least as many seats as current participants.'],
    })
  if (error.code.startsWith('22') || ['23502', '23503', '23514'].includes(error.code))
    return new ApiError(400, 'VALIDATION_ERROR', 'Check the event details and selected references.', {
      _form: ['Choose valid game/location references, dates and compatible tags.'],
    })
  if (error.code === '42501')
    return new ApiError(403, 'FORBIDDEN', 'You cannot perform this event operation.')
  return unavailable()
}

async function result<T>(
  request: PromiseLike<{ data: unknown; error: DatabaseError | null }>,
  schema: ZodType<T>,
): Promise<T> {
  let response
  try {
    response = await request
  } catch {
    throw unavailable()
  }
  if (response.error) throw databaseError(response.error)
  if (response.data === null) throw eventNotFound()
  return project(schema, response.data)
}

function project<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw unavailable()
  return parsed.data
}

function requireReturnedHost(value: HostEventDetails, expectedHostId: string): HostEventDetails {
  if (value.host.id !== expectedHostId || value.viewer.userId !== expectedHostId) throw unavailable()
  return value
}

function requireAttendance(value: AttendanceResult, eventId: string, hasJoined: boolean): AttendanceResult {
  if (value.eventId !== eventId || value.hasJoined !== hasJoined) throw unavailable()
  return value
}

export function createEventRepository(client: DatabaseClient): EventRepository {
  return {
    async list(filters) {
      const page = await result(
        client.rpc('discover_events', { p_filters: filters }),
        databaseEventPageSchema,
      )
      if (page.items.length > filters.limit || (page.hasMore && !page.items.length)) throw unavailable()
      const last = page.items.at(-1)
      return {
        items: page.items,
        pageInfo: { limit: filters.limit, nextCursor: page.hasMore && last ? encodeEventCursor(last) : null },
      }
    },
    async get(eventId, expectedUserId) {
      const value = await result(client.rpc('get_event', { p_event_id: eventId }), z.unknown())
      const safe = databaseEventDetailsSchema.safeParse(value)
      if (!safe.success) throw unavailable()
      const { viewer } = safe.data
      if (safe.data.id !== eventId) throw unavailable()
      if (viewer.userId !== (expectedUserId ?? null)) throw unavailable()
      const isHost = expectedUserId !== undefined && safe.data.host.id === expectedUserId
      if (viewer.isHost !== isHost || (viewer.hasJoined && (isHost || !expectedUserId))) throw unavailable()
      if (safe.data.visibility === 'private' && !isHost && !viewer.hasJoined) throw eventNotFound()
      if (isHost) return project(hostEventDetailsSchema, value)
      if (viewer.hasJoined) return project(participantEventDetailsSchema, value)
      return project(publicEventDetailsSchema, safe.data)
    },
    async create(input, expectedHostId) {
      return requireReturnedHost(
        await result(client.rpc('create_event', { p_input: input }), hostEventDetailsSchema),
        expectedHostId,
      )
    },
    async update(eventId, patch, expectedHostId) {
      return requireReturnedHost(
        await result(
          client.rpc('update_event', { p_event_id: eventId, p_patch: patch }),
          hostEventDetailsSchema,
        ),
        expectedHostId,
      )
    },
    async remove(eventId) {
      // Void RPCs return JSON null. Unlike details, null here is a successful deletion.
      let response
      try {
        response = await client.rpc('delete_event', { p_event_id: eventId })
      } catch {
        throw unavailable()
      }
      if (response.error) throw databaseError(response.error)
      if (response.data !== null && response.data !== undefined) throw unavailable()
    },
    async join(eventId) {
      return requireAttendance(
        await result(client.rpc('join_event', { p_event_id: eventId }), attendanceResultSchema),
        eventId,
        true,
      )
    },
    async leave(eventId) {
      return requireAttendance(
        await result(client.rpc('leave_event', { p_event_id: eventId }), attendanceResultSchema),
        eventId,
        false,
      )
    },
  }
}
