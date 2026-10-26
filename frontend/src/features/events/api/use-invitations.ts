import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { HttpError, httpRequest } from '@/lib/http-client'
import { EVENT_COVER_QUERY_KEY, EVENT_DETAILS_QUERY_KEY } from '@/lib/query-keys'
import type { EventActionSession } from './event-write-dtos'

const invitationSchema = z.object({
  code: z
    .string()
    .regex(/^(?:[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-){3}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/)
    .nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  revokedAt: z.iso.datetime({ offset: true }).nullable(),
})
type Invitation = z.infer<typeof invitationSchema>
export function useInvitations(session: EventActionSession) {
  const client = useQueryClient(),
    current = useRef(session),
    epoch = useRef(0),
    busy = useRef(false)
  current.current = session
  const [invitation, setInvitation] = useState<Invitation | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  useEffect(() => {
    setInvitation(null)
    setError('')
    setPending(false)
    busy.current = false
    return () => {
      epoch.current++
      abort.current?.abort()
    }
  }, [session.viewerId])
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    method: 'GET' | 'POST' = 'POST',
  ) {
    if (busy.current) throw new Error('Please wait for the current request.')
    busy.current = true
    setPending(true)
    setError('')
    const actor = session.viewerId,
      generation = epoch.current,
      controller = new AbortController()
    abort.current = controller
    const active = () => actor !== null && current.current.viewerId === actor && epoch.current === generation
    try {
      const token = await session.getAccessToken()
      if (!token || !active()) throw new Error('Log in again to continue.')
      const result = await httpRequest(path, schema, {
        method,
        body,
        token,
        viewerId:actor,
        signal: controller.signal,
        resource: 'event',
      })
      await session.getAccessToken()
      if (!active()) throw new Error('Your account changed. Try again.')
      return result
    } catch (err) {
      if (active())
        setError(
          err instanceof HttpError && err.status === 400 && path === '/api/private-events/join'
            ? 'This code is invalid, expired, or not available for joining.'
            : err instanceof Error
              ? err.message
              : 'The request failed. Try again.',
        )
      throw err
    } finally {
      if (epoch.current === generation) busy.current = false
      if (active()) setPending(false)
    }
  }
  async function manage(id: string, action: 'reveal' | 'rotate' | 'revoke') {
    const actor = session.viewerId,
      generation = epoch.current
    setInvitation(null)
    try {
      const result = await request(
        `/api/events/${id}/invitation${action === 'reveal' ? '' : `/${action}`}`,
        invitationSchema,
        undefined,
        action === 'reveal' ? 'GET' : 'POST',
      )
      if (current.current.viewerId === actor && epoch.current === generation) setInvitation(result)
    } catch {
      /* Exposed safe error. */
    }
  }
  async function join(code: string) {
    const actor = session.viewerId,
      generation = epoch.current
    const result = await request('/api/private-events/join', z.object({ eventId: z.uuid() }), { code })
    await client.cancelQueries({ queryKey: EVENT_DETAILS_QUERY_KEY })
    await client.cancelQueries({ queryKey: EVENT_COVER_QUERY_KEY })
    if (current.current.viewerId !== actor || epoch.current !== generation) return null
    client.removeQueries({ queryKey: EVENT_DETAILS_QUERY_KEY })
    client.removeQueries({ queryKey: EVENT_COVER_QUERY_KEY })
    void client.invalidateQueries({ queryKey: ['persistent-events'] })
    return result.eventId
  }
  return { invitation, pending, error, manage, join, hide: () => setInvitation(null) }
}
