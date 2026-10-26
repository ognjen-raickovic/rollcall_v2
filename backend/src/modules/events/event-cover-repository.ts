import { throwIfSuspended, suspendedError } from '../auth/account-status.js'
import { createClient } from '@supabase/supabase-js'
import { z, type ZodType } from 'zod'
import type { Environment } from '../../config/env.js'
import type { Database } from '../../db/database.types.js'
import { ApiError } from '../../shared/api-error.js'
import { eventNotFound } from './event-repository.js'
import { prepareEventCover, type CoverSource } from './event-cover-image.js'
import {
  coverAssociationSchema,
  coverReservationSchema,
  coverUrlSchema,
  readableCoverSchema,
} from './event-cover-schema.js'
import type { CoverMutationResult, CoverReservation, CoverUrl } from './event-cover-schema.js'

const BUCKET = 'event-covers'
export const COVER_URL_LIFETIME_SECONDS = 60
type CoverEnvironment = Environment & { EVENT_COVER_OPERATION_KEY?: string }
type RpcError = { code: string }

export interface EventCoverRepository {
  upload(eventId: string, actorId: string, source: CoverSource): Promise<CoverMutationResult>
  remove(eventId: string, actorId: string): Promise<CoverMutationResult>
  getUrl(eventId: string): Promise<CoverUrl | null>
  cleanup(eventId: string): Promise<boolean>
}

function unavailable(): ApiError {
  return new ApiError(
    503,
    'DEPENDENCY_UNAVAILABLE',
    'Event images are temporarily unavailable. Try again shortly.',
  )
}

function mapError(error: RpcError): ApiError {
  throwIfSuspended(error)
  if (error.code === 'P0002') return eventNotFound()
  if (error.code === '42501') return new ApiError(403, 'FORBIDDEN', 'You cannot change this event image.')
  if (error.code.startsWith('22') || ['23503', '23514'].includes(error.code))
    return new ApiError(400, 'VALIDATION_ERROR', 'The event image request is invalid.', {
      image: ['Reload the event before selecting another image.'],
    })
  if (['PT409', '23505', '40001'].includes(error.code))
    return new ApiError(409, 'CONFLICT', 'This event image changed. Reload the event and try again.')
  return unavailable()
}

function project<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw unavailable()
  return parsed.data
}

function checkedPath<T extends CoverReservation>(value: T, eventId: string): T {
  if (value.eventId !== eventId || value.path !== `${eventId}/${value.version}.webp`) throw unavailable()
  return value
}

export function createEventCoverRepository(
  env: CoverEnvironment,
  accessToken?: string,
  fetcher: typeof fetch = fetch,
): EventCoverRepository {
  function client(operations: boolean, signing = false, operationSignal?: AbortSignal) {
    if ((operations && !accessToken) || ((operations || signing) && !env.EVENT_COVER_OPERATION_KEY))
      throw unavailable()
    return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(operations || signing ? { 'x-rollcall-cover-key': env.EVENT_COVER_OPERATION_KEY ?? '' } : {}),
        },
        fetch: (input, init) => {
          const signals = [AbortSignal.timeout(env.SUPABASE_TIMEOUT_MS)]
          if (init?.signal) signals.push(init.signal)
          if (operationSignal) signals.push(operationSignal)
          return fetcher(input, {
            ...init,
            signal: AbortSignal.any(signals),
          })
        },
      },
    })
  }
  async function rpc<T>(
    operation: keyof Database['public']['Functions'],
    args: Record<string, string>,
    schema: ZodType<T>,
    operations = true,
    operationSignal?: AbortSignal,
  ): Promise<T> {
    try {
      // Arguments and function names originate only in this module's checked workflows.
      const response = await client(operations, false, operationSignal).rpc(operation, args as never)
      if (response.error) throw mapError(response.error)
      return project(schema, response.data)
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw unavailable()
    }
  }
  async function host(eventId: string, actorId: string): Promise<void> {
    const details = await rpc(
      'get_event',
      { p_event_id: eventId },
      z.object({
        id: z.uuid(),
        host: z.object({ id: z.uuid() }),
        viewer: z.object({ userId: z.uuid().nullable(), isHost: z.boolean() }),
      }),
      false,
    )
    if (
      details.id !== eventId ||
      details.host.id !== actorId ||
      details.viewer.userId !== actorId ||
      !details.viewer.isHost
    )
      throw eventNotFound()
  }
  async function cleanup(eventId: string): Promise<boolean> {
    if (!accessToken || !env.EVENT_COVER_OPERATION_KEY) return false
    const budget = AbortSignal.timeout(3000)
    try {
      const pending = await rpc(
        'pending_event_cover_cleanup',
        { p_event_id: eventId },
        z.array(coverReservationSchema).max(20),
        true,
        budget,
      )
      let pendingFailure = false
      for (const entry of pending) {
        if (budget.aborted) return true
        const item = checkedPath(entry, eventId)
        try {
          const deleted = await client(true, false, budget).storage.from(BUCKET).remove([item.path])
          if (deleted.error) {
            pendingFailure = true
            continue
          }
          await rpc('complete_event_cover_cleanup', { p_path: item.path }, z.unknown(), true, budget)
        } catch {
          pendingFailure = true
        }
      }
      // A full page can mean more work remains; the caller can retry this bounded operation.
      return pendingFailure || pending.length === 20
    } catch {
      return true
    }
  }
  return {
    async upload(eventId, actorId, source) {
      await host(eventId, actorId)
      const image = await prepareEventCover(source)
      const reserved = checkedPath(
        await rpc('reserve_event_cover', { p_event_id: eventId }, coverReservationSchema),
        eventId,
      )
      try {
        const stored = await client(true).storage.from(BUCKET).upload(reserved.path, image, {
          contentType: 'image/webp',
          upsert: false,
          cacheControl: '0',
        })
        if (stored.error?.message === 'ACCOUNT_SUSPENDED') throw suspendedError()
        if (stored.error) throw unavailable()
        const result = await rpc(
          'commit_event_cover',
          { p_event_id: eventId, p_path: reserved.path },
          coverAssociationSchema,
        )
        if (
          result.eventId !== eventId ||
          result.cover.kind !== 'custom' ||
          result.cover.version !== reserved.version
        )
          throw unavailable()
        return { ...result, cleanupPending: await cleanup(eventId) }
      } catch (error) {
        // Abort is idempotent and only marks a pending reservation. A lost commit
        // acknowledgement cannot cause an already-active image to be deleted.
        try {
          await rpc('abort_event_cover', { p_event_id: eventId, p_path: reserved.path }, z.unknown())
          await cleanup(eventId)
        } catch {
          /* The durable manifest retains recoverable pending work. */
        }
        if (error instanceof ApiError) throw error
        throw unavailable()
      }
    },
    async remove(eventId, actorId) {
      await host(eventId, actorId)
      const result = await rpc('remove_event_cover', { p_event_id: eventId }, coverAssociationSchema)
      if (result.eventId !== eventId || result.cover.kind !== 'default') throw unavailable()
      return { ...result, cleanupPending: await cleanup(eventId) }
    },
    async getUrl(eventId) {
      const readable = await rpc(
        'get_event_cover',
        { p_event_id: eventId },
        readableCoverSchema.nullable(),
        false,
      )
      if (!readable) return null
      const item = checkedPath(readable, eventId)
      try {
        // Storage signing also requires the server capability. Otherwise a legitimate
        // member could issue a much longer-lived URL directly through the Data API.
        const signed = await client(false, true)
          .storage.from(BUCKET)
          .createSignedUrl(item.path, COVER_URL_LIFETIME_SECONDS)
        if (signed.error?.message === 'ACCOUNT_SUSPENDED') throw suspendedError()
        if (signed.error || !signed.data?.signedUrl) throw unavailable()
        const url = new URL(signed.data.signedUrl)
        if (
          url.origin !== new URL(env.SUPABASE_URL).origin ||
          !url.pathname.endsWith(`/storage/v1/object/sign/${BUCKET}/${item.path}`)
        )
          throw unavailable()
        return project(coverUrlSchema, {
          eventId,
          version: item.version,
          imageUrl: url.href,
          visibility: item.visibility,
          expiresAt: new Date(Date.now() + COVER_URL_LIFETIME_SECONDS * 1000).toISOString(),
        })
      } catch (error) {
        if (error instanceof ApiError) throw error
        throw unavailable()
      }
    },
    cleanup,
  }
}
