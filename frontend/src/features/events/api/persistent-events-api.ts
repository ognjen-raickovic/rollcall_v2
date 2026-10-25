import { z } from 'zod'

import { HttpError, httpRequest } from '@/lib/http-client'

import { eventDetailsSchema, eventDiscoveryFiltersSchema, eventPageSchema, isEventId } from './event-dtos'
import type { EventDetails, EventDiscoveryFilters, EventPage } from './event-dtos'

function invalidRequest(): HttpError {
  return new HttpError(400, 'Choose valid event filters or select an event from discovery.')
}

function sessionChanged(): HttpError {
  return new HttpError(401, 'Your account changed. Log in again or reload this event.')
}

export const persistentEventsApi = {
  list: async (
    filters: EventDiscoveryFilters = {},
    cursor: string | null = null,
    signal?: AbortSignal,
  ): Promise<EventPage> => {
    const parsed = eventDiscoveryFiltersSchema.safeParse(filters)
    if (!parsed.success) throw invalidRequest()
    const cursorResult = z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/)
      .nullable()
      .safeParse(cursor)
    if (!cursorResult.success) throw invalidRequest()
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(parsed.data))
      if (value !== undefined && value !== '') params.set(key, String(value))
    if (cursorResult.data) params.set('cursor', cursorResult.data)
    const page = await httpRequest(`/api/events?${params}`, eventPageSchema, { signal, resource: 'event' })
    if (
      page.pageInfo.limit !== (parsed.data.limit ?? 12) ||
      page.items.length > page.pageInfo.limit ||
      (page.pageInfo.nextCursor && page.items.length === 0)
    )
      throw new Error('The event service returned unexpected pagination. Please try again.')
    return page
  },
  get: async (
    eventId: string,
    viewerId: string | null,
    getAccessToken: () => Promise<string | null>,
    signal?: AbortSignal,
  ): Promise<EventDetails> => {
    if (!isEventId(eventId) || (viewerId !== null && !isEventId(viewerId))) throw invalidRequest()
    const token = await getAccessToken()
    if ((viewerId !== null) !== Boolean(token)) throw sessionChanged()
    if (signal?.aborted) throw signal.reason
    const event = await httpRequest(`/api/events/${encodeURIComponent(eventId)}`, eventDetailsSchema, {
      token: token ?? undefined,
      signal,
      resource: 'event',
    })
    // The getter is bound to the independently observed account. Rechecking it after
    // HTTP prevents a late protected response from being accepted after an account switch.
    const currentToken = await getAccessToken()
    if (
      (viewerId !== null) !== Boolean(currentToken) ||
      event.viewer.userId !== viewerId ||
      event.id !== eventId
    )
      throw sessionChanged()
    if (signal?.aborted) throw signal.reason
    return event
  },
}
