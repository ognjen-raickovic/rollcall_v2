import { z } from 'zod'
import { HttpError, httpRequest } from '@/lib/http-client'
import type { EventActionSession } from './event-write-dtos'

const author = z.object({ id: z.uuid(), displayName: z.string().min(1).max(80) }).nullable()
const item = z
  .object({
    id: z.uuid(),
    author,
    body: z.string().max(2000).nullable(),
    deleted: z.boolean(),
    hidden: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    editedAt: z.iso.datetime({ offset: true }).nullable(),
    canEdit: z.boolean(),
    canDelete: z.boolean(),
    parentId: z.uuid().nullable().optional(),
    isHost: z.boolean().optional(),
    replyCount: z.number().int().nonnegative().optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
  })
  .refine((value) => !(value.hidden || value.deleted) || (value.body === null && value.rating == null))
export const discussionPageSchema = z.object({
  eventId: z.uuid(),
  viewerId: z.uuid().nullable(),
  kind: z.enum(['comments', 'reviews']),
  items: z.array(item).max(20),
  nextCursor: z
    .string()
    .regex(/^[0-9]{1,18}$/)
    .nullable(),
  permissions: z.object({
    commentsOpen: z.boolean(),
    reviewsOpen: z.boolean(),
    canComment: z.boolean(),
    canReview: z.boolean(),
    canModerateComments: z.boolean(),
    canModerateReviews: z.boolean(),
    serverTime: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    cancelled: z.boolean(),
  }),
})
export type DiscussionItem = z.infer<typeof item>
export type DiscussionPage = z.infer<typeof discussionPageSchema>
export type DiscussionKind = 'comments' | 'reviews'
export type DiscussionContext = { eventId: string; kind: DiscussionKind; session: EventActionSession }
export type DiscussionChange = {
  operation: 'create' | 'edit' | 'delete' | 'hide'
  id?: string
  parentId?: string
  body?: string | null
  rating?: number
  reason?: string
}
const bodySchema = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) =>
      Array.from(value).every((character) => {
        const code = character.charCodeAt(0)
        return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
      }),
    'Use plain text without control characters.',
  )
const writeSchema = z.strictObject({
  body: bodySchema.nullable().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  reason: z.string().trim().min(5).max(500).optional(),
})
async function token(session: EventActionSession, signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason
  const value = await session.getAccessToken()
  if (session.viewerId && !value) throw new HttpError(401, 'Your session changed. Log in again.')
  if (signal?.aborted) throw signal.reason
  return value
}
function path(eventId: string, kind: DiscussionKind) {
  if (!z.uuid().safeParse(eventId).success) throw new HttpError(400, 'Choose a valid event.')
  return `/api/events/${eventId}/${kind}`
}
export const discussionApi = {
  async list(
    eventId: string,
    kind: DiscussionKind,
    session: EventActionSession,
    cursor: string | null,
    parentId: string | null,
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    if (parentId && !z.uuid().safeParse(parentId).success) throw new HttpError(400, 'Choose a valid comment.')
    const value = await httpRequest(
      path(eventId, kind) + (parentId ? `/${parentId}/replies` : '') + '?' + params,
      discussionPageSchema,
      {
        token: (await token(session, signal)) ?? undefined,
        viewerId: session.viewerId,
        signal,
        resource: 'event',
      },
    )
    await token(session, signal)
    if (
      value.viewerId !== session.viewerId ||
      value.eventId !== eventId ||
      value.kind !== kind ||
      value.items.some((item) =>
        kind === 'comments'
          ? item.parentId !== parentId ||
            typeof item.isHost !== 'boolean' ||
            typeof item.replyCount !== 'number'
          : item.rating === undefined,
      )
    )
      throw new Error('Unexpected discussion response. Reload this event.')
    return value
  },
  async change(eventId: string, kind: DiscussionKind, session: EventActionSession, change: DiscussionChange) {
    if (!session.viewerId) throw new HttpError(401, 'Log in to contribute.')
    const base = path(eventId, kind)
    const { operation, id, parentId, ...fields } = change
    for (const value of [id, parentId])
      if (value && !z.uuid().safeParse(value).success)
        throw new HttpError(400, 'Choose a valid discussion item.')
    const parsed = writeSchema.safeParse(fields)
    if (
      !parsed.success ||
      ((operation === 'create' || operation === 'edit') &&
        (kind === 'comments' ? !parsed.data.body : parsed.data.rating === undefined))
    )
      throw new HttpError(400, 'Check your text and rating. Text must be at most 2,000 characters.')
    const result = await httpRequest(
      base + (parentId ? `/${parentId}/replies` : id ? `/${id}` : '') + (operation === 'hide' ? '/hide' : ''),
      z.object({ eventId: z.uuid(), viewerId: z.uuid(), id: z.uuid() }),
      {
        method: operation === 'edit' ? 'PATCH' : operation === 'delete' ? 'DELETE' : 'POST',
        body: operation === 'delete' ? undefined : parsed.data,
        token: (await token(session)) ?? undefined,
        viewerId: session.viewerId,
        resource: 'event',
      },
    )
    await token(session)
    if (result.viewerId !== session.viewerId || result.eventId !== eventId || (id && result.id !== id))
      throw new Error('Unexpected discussion acknowledgement.')
    return result
  },
}
