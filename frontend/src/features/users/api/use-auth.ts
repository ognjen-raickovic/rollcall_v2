import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { EVENT_COVER_QUERY_KEY, EVENT_DETAILS_QUERY_KEY } from '@/lib/query-keys'

import { authApi } from './auth-api'

export const authKey = ['auth-account'] as const
export const recoveryKey = ['auth-recovery'] as const

export function useAuth() {
  return useQuery({ queryKey: authKey, queryFn: authApi.get, staleTime: Infinity, retry: false })
}

export function useApiSession() {
  const account = useAuth()
  const viewerId = account.data?.id ?? null
  const getAccessToken = useCallback(() => authApi.accessToken(viewerId), [viewerId])
  return {
    viewerId,
    getAccessToken,
    ready: !account.isPending && !account.error,
    error: account.error,
  }
}

export function useAccountIdentity() {
  const account = useAuth()
  return useQuery({
    queryKey: ['account-identity', account.data?.id],
    queryFn: ({ signal }) => authApi.me(signal),
    enabled: Boolean(account.data),
    retry: false,
    staleTime: 30_000,
  })
}

export function useAuthLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (account) => {
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
    mutationFn: authApi.logout,
    onSuccess: () => {
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
    mutationFn: authApi.updatePassword,
    onSuccess: () => {
      client.removeQueries({ queryKey: EVENT_DETAILS_QUERY_KEY })
      client.removeQueries({ queryKey: EVENT_COVER_QUERY_KEY })
      client.setQueryData(authKey, null)
      client.setQueryData(recoveryKey, false)
    },
  })
}

export function useRecoverySession() {
  return useQuery({ queryKey: recoveryKey, queryFn: () => false, initialData: false, staleTime: Infinity })
}
