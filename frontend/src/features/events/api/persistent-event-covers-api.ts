import { z } from 'zod'
import { HttpError, httpRequest } from '@/lib/http-client'
import { eventCoverSchema, isEventId } from './event-dtos'
import type { EventActionSession } from './event-write-dtos'
import { EVENT_IMAGE_TYPES, MAX_EVENT_IMAGE_BYTES, validEventImageDataUrl } from './event-covers'

export const coverAccessSchema = z.object({
  eventId: z.uuid(),
  version: z.uuid(),
  imageUrl: z.string().max(4096),
  expiresAt: z.iso.datetime({ offset: true }),
  visibility: z.enum(['public', 'unlisted', 'private']),
})
export const coverMutationSchema = z.object({
  eventId: z.uuid(),
  cover: eventCoverSchema,
  cleanupPending: z.boolean(),
})
export type CoverAccess = z.infer<typeof coverAccessSchema>
export type CoverMutationResult = z.infer<typeof coverMutationSchema>

function invalid(): Error {
  return new Error('The event cover service returned unexpected data. Please try again.')
}

async function sessionToken(session: EventActionSession, required: boolean, signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason
  if (session.viewerId !== null && !isEventId(session.viewerId))
    throw new HttpError(401, 'Log in with a real account to continue.')
  if (required && !isEventId(session.viewerId)) throw new HttpError(401, 'Log in to update event covers.')
  if (!session.viewerId) return undefined
  const token = await session.getAccessToken()
  if (!token) throw new HttpError(401, 'Your session could not be verified. Log in again to continue.')
  if (signal?.aborted) throw signal.reason
  return token
}

function path(id: string): string {
  if (!isEventId(id)) throw new HttpError(400, 'Choose an event with a valid event ID.')
  return `/api/events/${encodeURIComponent(id)}`
}

export function validateCoverAccess(value: CoverAccess, id: string, version: string): CoverAccess {
  if (value.eventId !== id || value.version !== version) throw invalid()
  let url: URL
  let origin: URL
  try {
    url = new URL(value.imageUrl)
    origin = new URL(import.meta.env.VITE_SUPABASE_URL)
  } catch {
    throw invalid()
  }
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    url.origin !== origin.origin ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== `/storage/v1/object/sign/event-covers/${id}/${version}.webp` ||
    !url.searchParams.get('token') ||
    [...url.searchParams.keys()].some((key) => key !== 'token') ||
    Date.parse(value.expiresAt) <= Date.now() ||
    Date.parse(value.expiresAt) > Date.now() + 90000
  )
    throw invalid()
  return value
}

async function validateFile(file: File) {
  const extensions: Record<string, RegExp> = {
    'image/jpeg': /\.jpe?g$/i,
    'image/png': /\.png$/i,
    'image/webp': /\.webp$/i,
  }
  if (!extensions[file.type]?.test(file.name) || file.size < 12 || file.size > MAX_EVENT_IMAGE_BYTES)
    throw new HttpError(400, 'Choose a valid JPG, PNG, or WebP image of 3 MB or less.', {
      image: ['Choose a valid JPG, PNG, or WebP image of 3 MB or less.'],
    })
}

export function preparedCoverFile(dataUrl: string): File {
  if (!validEventImageDataUrl(dataUrl)) throw new Error('Choose a valid cover image again.')
  const [header, content] = dataUrl.split(',')
  const mime = header?.slice(5).split(';')[0]
  if (!mime || !content || !EVENT_IMAGE_TYPES.some((type) => type === mime))
    throw new Error('Choose a valid cover image again.')
  const bytes = Uint8Array.from(atob(content), (character) => character.charCodeAt(0))
  const extension = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]
  return new File([bytes], `cover.${extension}`, { type: mime })
}

export const persistentEventCoversApi = {
  async get(id: string, version: string, session: EventActionSession, signal?: AbortSignal) {
    if (!isEventId(version)) throw invalid()
    const value = await httpRequest(`${path(id)}/cover-url`, coverAccessSchema.nullable(), {
      token: await sessionToken(session, false, signal),
      signal,
      resource: 'event',
    })
    await sessionToken(session, false, signal)
    if (!value) return null
    if (value.visibility === 'private' && !session.viewerId) throw invalid()
    return validateCoverAccess(value, id, version)
  },
  async upload(id: string, file: File, session: EventActionSession, signal?: AbortSignal) {
    const endpoint = `${path(id)}/cover`
    await validateFile(file)
    const body = new FormData()
    body.set('file', file)
    const result = await httpRequest(endpoint, coverMutationSchema, {
      method: 'POST',
      body,
      token: await sessionToken(session, true, signal),
      signal,
      resource: 'event',
    })
    await sessionToken(session, true, signal)
    if (result.eventId !== id || result.cover.kind !== 'custom') throw invalid()
    return result
  },
  async remove(id: string, session: EventActionSession, signal?: AbortSignal) {
    const result = await httpRequest(`${path(id)}/cover`, coverMutationSchema, {
      method: 'DELETE',
      token: await sessionToken(session, true, signal),
      signal,
      resource: 'event',
    })
    await sessionToken(session, true, signal)
    if (result.eventId !== id || result.cover.kind !== 'default') throw invalid()
    return result
  },
}
