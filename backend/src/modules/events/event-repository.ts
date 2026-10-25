import { z, type ZodType } from 'zod'
import type { DatabaseClient } from '../../db/supabase.js'
import { ApiError } from '../../shared/api-error.js'
import { databaseEventPageSchema, hostEventDetailsSchema, publicEventDetailsSchema } from './event-schema.js'
import { encodeEventCursor } from './event-pagination.js'
import type { EventRepository, HostEventDetails } from './types.js'

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
  const parsed = schema.safeParse(response.data)
  if (!parsed.success) throw unavailable()
  return parsed.data
}

function requireReturnedHost(value: HostEventDetails, expectedHostId: string): HostEventDetails {
  if (value.host.id !== expectedHostId) throw unavailable()
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
    async get(eventId, expectedHostId) {
      const value = await result(client.rpc('get_event', { p_event_id: eventId }), z.unknown())
      const safe = publicEventDetailsSchema.safeParse(value)
      if (!safe.success) throw unavailable()
      const isHost = expectedHostId !== undefined && safe.data.host.id === expectedHostId
      if (safe.data.visibility === 'private' && !isHost) throw eventNotFound()
      if (!isHost) return safe.data
      const authorized = hostEventDetailsSchema.safeParse(value)
      if (!authorized.success) throw unavailable()
      return requireReturnedHost(authorized.data, expectedHostId)
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
  }
}
