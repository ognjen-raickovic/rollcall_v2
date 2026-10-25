import { z, type ZodType } from 'zod'

import { HttpError, httpRequest } from '@/lib/http-client'
import { isEventId } from './event-dtos'
import {
  attendanceResultSchema,
  createEventInputSchema,
  hostEventDetailsSchema,
  updateEventInputSchema,
} from './event-write-dtos'
import type {
  AttendanceResult,
  CreateEventInput,
  EventActionSession,
  HostEventDetails,
  UpdateEventInput,
} from './event-write-dtos'

export type { EventActionSession } from './event-write-dtos'

function invalidEvent(): HttpError {
  return new HttpError(400, 'Choose an event with a valid event ID.')
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const fields: Record<string, string[]> = {}
  for (const issue of result.error.issues) {
    const field = issue.path.map(String).join('.') || '_form'
    ;(fields[field] ??= []).push(issue.message)
  }
  throw new HttpError(400, 'Check the event fields and try again.', fields)
}

async function token(session: EventActionSession, signal?: AbortSignal): Promise<string> {
  if (!isEventId(session.viewerId)) throw new HttpError(401, 'Log in with a real account to continue.')
  if (signal?.aborted) throw signal.reason
  const value = await session.getAccessToken()
  if (!value) throw new HttpError(401, 'Your session could not be verified. Log in again to continue.')
  if (signal?.aborted) throw signal.reason
  return value
}

async function request<T>(
  path: string,
  schema: ZodType<T>,
  session: EventActionSession,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const value = await httpRequest(path, schema, {
    method,
    body,
    token: await token(session, signal),
    signal,
    resource: 'event',
  })
  // A write may have committed even if the session changed while awaiting its response.
  // Rejecting stale acknowledgement prevents another viewer's UI/cache from adopting it.
  await token(session, signal)
  return value
}

function host(event: HostEventDetails, session: EventActionSession, eventId?: string): HostEventDetails {
  if (
    event.host.id !== session.viewerId ||
    event.viewer.userId !== session.viewerId ||
    (eventId !== undefined && event.id !== eventId)
  )
    throw new Error('The event service returned unexpected account data. Reload this page.')
  return event
}

async function attendance(
  eventId: string,
  session: EventActionSession,
  joining: boolean,
  signal?: AbortSignal,
): Promise<AttendanceResult> {
  if (!isEventId(eventId)) throw invalidEvent()
  const value = await request(
    `/api/events/${encodeURIComponent(eventId)}/attendees/me`,
    attendanceResultSchema,
    session,
    joining ? 'POST' : 'DELETE',
    undefined,
    signal,
  )
  if (value.eventId !== eventId || value.hasJoined !== joining)
    throw new Error('The event service returned unexpected attendance data. Reload this page.')
  return value
}

export const persistentEventActionsApi = {
  create: async (
    input: CreateEventInput,
    session: EventActionSession,
    signal?: AbortSignal,
  ): Promise<HostEventDetails> =>
    host(
      await request(
        '/api/events',
        hostEventDetailsSchema,
        session,
        'POST',
        parse(createEventInputSchema, input),
        signal,
      ),
      session,
    ),
  update: async (
    eventId: string,
    input: UpdateEventInput,
    session: EventActionSession,
    signal?: AbortSignal,
  ): Promise<HostEventDetails> => {
    if (!isEventId(eventId)) throw invalidEvent()
    return host(
      await request(
        `/api/events/${encodeURIComponent(eventId)}`,
        hostEventDetailsSchema,
        session,
        'PATCH',
        parse(updateEventInputSchema, input),
        signal,
      ),
      session,
      eventId,
    )
  },
  remove: async (eventId: string, session: EventActionSession, signal?: AbortSignal): Promise<void> => {
    if (!isEventId(eventId)) throw invalidEvent()
    return request(
      `/api/events/${encodeURIComponent(eventId)}`,
      z.undefined(),
      session,
      'DELETE',
      undefined,
      signal,
    )
  },
  join: (eventId: string, session: EventActionSession, signal?: AbortSignal) =>
    attendance(eventId, session, true, signal),
  leave: (eventId: string, session: EventActionSession, signal?: AbortSignal) =>
    attendance(eventId, session, false, signal),
}
