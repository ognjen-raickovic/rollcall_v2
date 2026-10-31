import { notify, notifyFailure } from '@/lib/notifications'
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ACCOUNT_STATUS_QUERY_KEY, ADMIN_QUERY_KEY } from '@/lib/query-keys'
import { accountStatusApi } from './account-status-api'
export function useAccountStatus(viewer: string | null) {
  return useQuery({
    queryKey: [...ACCOUNT_STATUS_QUERY_KEY, viewer],
    queryFn: ({ signal }) => accountStatusApi.self(viewer ?? '', signal),
    enabled: Boolean(viewer),
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: 'always',
  })
}
export function useAccessAccount(viewer: string, target: string) {
  return useQuery({
    queryKey: [...ADMIN_QUERY_KEY, viewer, 'account-access', target],
    queryFn: ({ signal }) => accountStatusApi.lookup(viewer, target, signal),
    enabled: Boolean(viewer && target),
    retry: false,
    gcTime: 0,
    refetchInterval: 15000,
  })
}
export function useSuspensionAudit(viewer: string, target: string, before: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...ADMIN_QUERY_KEY, viewer, 'suspension-audit', target, before],
    queryFn: ({ signal }) => accountStatusApi.audit(viewer, target, before, signal),
    enabled: Boolean(viewer && target && enabled),
    retry: false,
    gcTime: 0,
  })
}
export function useChangeSuspension(viewer: string) {
  const client = useQueryClient(),
    controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [viewer])
  return useMutation({
    onSuccess: () => {
      if (client.getQueryData<{ id: string }>(['auth-account'])?.id === viewer) notify('account.updated')
    },
    onError: (error) => {
      if (client.getQueryData<{ id: string }>(['auth-account'])?.id === viewer) notifyFailure(error)
    },
    gcTime: 0,
    mutationFn: async (input: { target: string; suspend: boolean; reason: string }) => {
      controller.current?.abort()
      const active = new AbortController()
      controller.current = active
      const result = await accountStatusApi.change(
        viewer,
        input.target,
        input.suspend,
        input.reason,
        active.signal,
      )
      if (active.signal.aborted || client.getQueryData<{ id: string }>(['auth-account'])?.id !== viewer)
        throw new Error('Your account changed. Try again.')
      await client.invalidateQueries({ queryKey: ADMIN_QUERY_KEY })
      await client.invalidateQueries({ queryKey: [...ACCOUNT_STATUS_QUERY_KEY, input.target] })
      return result
    },
  })
}
