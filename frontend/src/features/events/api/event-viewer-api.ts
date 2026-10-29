import { z } from 'zod'
import { HttpError, httpRequest } from '@/lib/http-client'
import type { EventActionSession } from './event-write-dtos'

export type EventBrowseSession = EventActionSession & {
  ready?: boolean
  error?: Error | null
  signedIn?: boolean
}
export const eventViewerStatusSchema = z.object({
  userId: z.uuid(),
  items: z
    .array(
      z
        .object({ eventId: z.uuid(), isHost: z.boolean(), hasJoined: z.boolean() })
        .refine((item) => !(item.isHost && item.hasJoined)),
    )
    .max(50),
})
export type EventViewerStatus = z.infer<typeof eventViewerStatusSchema>['items'][number]
export const anonymousEventSession: EventBrowseSession = {
  viewerId: null,
  getAccessToken: async () => null,
  ready: true,
}

export const eventViewerApi = {
  async get(eventIds: string[], session: EventActionSession, signal?: AbortSignal) {
    const ids = z.array(z.uuid()).min(1).max(50).parse(eventIds)
    if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Choose each event once.')
    const token = await session.getAccessToken()
    if (!session.viewerId || !token || signal?.aborted)
      throw new HttpError(401, 'Your account changed. Reload the events.')
    const value = await httpRequest('/api/events/viewer-status', eventViewerStatusSchema, {
      method: 'POST',
      body: { eventIds: ids },
      token,
      viewerId: session.viewerId,
      signal,
      resource: 'event',
    })
    if (!(await session.getAccessToken()) || signal?.aborted || value.userId !== session.viewerId)
      throw new HttpError(401, 'Your account changed. Reload the events.')
    if (
      new Set(value.items.map((item) => item.eventId)).size !== value.items.length ||
      value.items.some((item) => !ids.includes(item.eventId))
    )
      throw new Error('Event participation could not be verified. Please try again.')
    return value
  },
}
