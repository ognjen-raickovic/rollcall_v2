import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notify, notifyFailure } from '@/lib/notifications'
import { useCallback } from 'react'
import {
  ACCOUNT_STATUS_QUERY_KEY,
  ADMIN_QUERY_KEY,
  EVENT_COVER_QUERY_KEY,
  EVENT_DETAILS_QUERY_KEY,
  EVENT_VIEWER_QUERY_KEY,
} from '@/lib/query-keys'

import { authApi } from './auth-api'
import { useAccountStatus } from './use-account-status'

export const authKey = ['auth-account'] as const
export const recoveryKey = ['auth-recovery'] as const

export function useAuth() {
  return useQuery({ queryKey: authKey, queryFn: authApi.get, staleTime: Infinity, retry: false })
}

export function useApiSession() {
  const account = useAuth()
  const actor = account.data?.id ?? null,
    status = useAccountStatus(actor)
  const suspended = status.data?.status === 'suspended'
  const viewerId = status.data?.status === 'active' ? actor : null
  const getAccessToken = useCallback(
    () => (actor && !viewerId ? Promise.resolve(null) : authApi.accessToken(viewerId)),
    [viewerId, actor],
  )
  return {
    viewerId,
    signedIn: Boolean(account.data),
    getAccessToken,
    ready:
      !account.isPending && !account.error && (!actor || suspended || (!status.isPending && !status.error)),
    error: account.error ?? status.error,
  }
}

export function useAccountIdentity() {
  const account = useAuth()
  return useQuery({
    queryKey: ['account-identity', account.data?.id],
    queryFn: ({ signal }) => authApi.me(account.data?.id ?? '', signal),
    enabled: Boolean(account.data),
    retry: false,
    staleTime: 30_000,
    gcTime: 0,
  })
}

export function useAuthLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (account) => {
      client.removeQueries({ queryKey: EVENT_VIEWER_QUERY_KEY })
      client.removeQueries({ queryKey: ['my-events'] })
      client.removeQueries({ queryKey: ACCOUNT_STATUS_QUERY_KEY })
      client.removeQueries({ queryKey: ADMIN_QUERY_KEY })
      client.removeQueries({ queryKey: EVENT_DETAILS_QUERY_KEY })
      client.removeQueries({ queryKey: EVENT_COVER_QUERY_KEY })
      client.setQueryData(authKey, account)
      client.setQueryData(['session'], null)
    },
  })
}

export function useRegister() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: ({ account }) => {
      client.removeQueries({ queryKey: EVENT_VIEWER_QUERY_KEY })
      client.removeQueries({ queryKey: EVENT_DETAILS_QUERY_KEY })
      client.removeQueries({ queryKey: EVENT_COVER_QUERY_KEY })
      if (account) client.setQueryData(authKey, account)
      client.setQueryData(['session'], null)
    },
  })
}

export function useAuthLogout() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['auth-logout'],
    mutationFn: authApi.logout,
    onMutate: () => {
      const cache = client.getMutationCache()
      for (const mutation of cache.findAll({ mutationKey: ['auth-logout'], status: 'error' }))
        cache.remove(mutation)
    },
    onSuccess: () => {
      client.removeQueries({ queryKey: EVENT_VIEWER_QUERY_KEY })
      client.removeQueries({ queryKey: ['my-events'] })
      client.removeQueries({ queryKey: ACCOUNT_STATUS_QUERY_KEY })
      client.removeQueries({ queryKey: ADMIN_QUERY_KEY })
      client.removeQueries({ queryKey: EVENT_DETAILS_QUERY_KEY })
      client.removeQueries({ queryKey: EVENT_COVER_QUERY_KEY })
      client.setQueryData(authKey, null)
      client.setQueryData(['session'], null)
      client.setQueryData(recoveryKey, false)
      client.removeQueries({ queryKey: ['account-identity'] })
      client.removeQueries({ queryKey: ['events'] })
      client.removeQueries({ queryKey: ['own-profile'] })
      client.removeQueries({ queryKey: ['profile-experience'] })
      client.removeQueries({ queryKey: ['public-profile'] })
    },
  })
}

export function usePasswordRecovery() {
  return useMutation({ mutationFn: authApi.recover })
}
export function useResendConfirmation() {
  return useMutation({ mutationFn: authApi.resend })
}
export function useUpdatePassword() {
  const client = useQueryClient()
  return useMutation({
    onError: (error: Error) => notifyFailure(error),
    mutationFn: authApi.updatePassword,
    onSuccess: () => {
      client.removeQueries({ queryKey: EVENT_VIEWER_QUERY_KEY })
      client.removeQueries({ queryKey: EVENT_DETAILS_QUERY_KEY })
      client.removeQueries({ queryKey: EVENT_COVER_QUERY_KEY })
      client.setQueryData(authKey, null)
      client.setQueryData(recoveryKey, false)
      notify('settings.updated')
    },
  })
}

export function useRecoverySession() {
  return useQuery({
    queryKey: recoveryKey,
    queryFn: () => false,
    initialData: false,
    staleTime: Infinity,
  })
}
