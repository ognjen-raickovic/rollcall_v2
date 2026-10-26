import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ADMIN_QUERY_KEY, EVENT_DETAILS_QUERY_KEY, EVENT_COVER_QUERY_KEY } from '@/lib/query-keys'
import { moderationApi, type ReportStatus, type ReportCursor } from './moderation-api'
import { useAuth } from './use-auth'
export function useReportQueue(status: ReportStatus, cursor: ReportCursor | null) {
  const auth = useAuth(),
    viewer = auth.data?.id ?? ''
  return useQuery({
    queryKey: [...ADMIN_QUERY_KEY, viewer, 'event-reports', status, cursor],
    queryFn: ({ signal }) => moderationApi.list(viewer, status, cursor, signal),
    enabled: Boolean(viewer),
    retry: false,
    gcTime: 0,
    refetchInterval: 30000,
  })
}
export function useReportDetail(id: string | null) {
  const auth = useAuth(),
    viewer = auth.data?.id ?? ''
  return useQuery({
    queryKey: [...ADMIN_QUERY_KEY, viewer, 'event-report', id],
    queryFn: ({ signal }) => moderationApi.get(viewer, id ?? '', signal),
    enabled: Boolean(viewer && id),
    retry: false,
    gcTime: 0,
  })
}
export function useModerationDecision() {
  const auth = useAuth(),
    viewer = auth.data?.id ?? '',
    client = useQueryClient(),
    controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [viewer])
  return useMutation({
    gcTime: 0,
    mutationFn: async (input: { id: string; action: 'dismiss' | 'take-action'; note: string }) => {
      controller.current?.abort()
      const active = new AbortController()
      controller.current = active
      const result = await moderationApi.decide(viewer, input.id, input.action, input.note, active.signal)
      if (active.signal.aborted || client.getQueryData<{ id: string }>(['auth-account'])?.id !== viewer)
        throw new Error('Your account changed. Try again.')
      await client.cancelQueries({ queryKey: EVENT_DETAILS_QUERY_KEY })
      await client.cancelQueries({ queryKey: EVENT_COVER_QUERY_KEY })
      if (active.signal.aborted || client.getQueryData<{ id: string }>(['auth-account'])?.id !== viewer)
        throw new Error('Your account changed. Try again.')
      client.removeQueries({ queryKey: EVENT_DETAILS_QUERY_KEY })
      client.removeQueries({ queryKey: EVENT_COVER_QUERY_KEY })
      await Promise.all([
        client.invalidateQueries({ queryKey: ADMIN_QUERY_KEY }),
        client.invalidateQueries({ queryKey: ['persistent-events'] }),
      ])
      return result
    },
  })
}
