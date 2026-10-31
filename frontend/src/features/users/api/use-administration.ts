import { notify, notifyFailure } from '@/lib/notifications'
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ADMIN_QUERY_KEY } from '@/lib/query-keys'
import { administrationApi } from './administration-api'
import { useAuth } from './use-auth'

export function usePermissions() {
  const auth = useAuth(),
    viewer = auth.data?.id ?? ''
  return useQuery({
    queryKey: [...ADMIN_QUERY_KEY, viewer, 'permissions'],
    queryFn: ({ signal }) => administrationApi.permissions(viewer, signal),
    enabled: Boolean(viewer),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: 'always',
  })
}
export function useAdminUsers(after: string | null, userId: string, enabled: boolean) {
  const auth = useAuth(),
    viewer = auth.data?.id ?? ''
  return useQuery({
    queryKey: [...ADMIN_QUERY_KEY, viewer, 'users', after, userId],
    queryFn: ({ signal }) => administrationApi.users(viewer, after, userId, signal),
    enabled: Boolean(viewer) && enabled,
    retry: false,
    gcTime: 0,
    refetchInterval: 30000,
  })
}
export function useRoleAudit(before: string | null, enabled: boolean) {
  const auth = useAuth(),
    viewer = auth.data?.id ?? ''
  return useQuery({
    queryKey: [...ADMIN_QUERY_KEY, viewer, 'audit', before],
    queryFn: ({ signal }) => administrationApi.audit(viewer, before, signal),
    enabled: Boolean(viewer) && enabled,
    retry: false,
    gcTime: 0,
    refetchInterval: 30000,
  })
}
export function useChangeAdminRole() {
  const auth = useAuth(),
    viewer = auth.data?.id ?? '',
    client = useQueryClient(),
    controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [viewer])
  return useMutation({
    onSuccess: () => {
      if (client.getQueryData<{ id: string }>(['auth-account'])?.id === viewer) notify('role.updated')
    },
    onError: (error) => {
      if (client.getQueryData<{ id: string }>(['auth-account'])?.id === viewer) notifyFailure(error)
    },
    gcTime: 0,
    mutationFn: async (value: { id: string; role: 'user' | 'admin' }) => {
      controller.current?.abort()
      const active = new AbortController()
      controller.current = active
      const result = await administrationApi.changeRole(viewer, value.id, value.role, active.signal)
      if (active.signal.aborted || client.getQueryData<{ id: string }>(['auth-account'])?.id !== viewer)
        throw new Error('Your account changed. Try again.')
      await client.invalidateQueries({ queryKey: ADMIN_QUERY_KEY })
      return result
    },
  })
}
