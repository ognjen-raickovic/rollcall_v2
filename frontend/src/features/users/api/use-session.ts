import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { sessionApi } from './session-api'

const sessionKey = ['session'] as const

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: sessionApi.get,
    staleTime: Infinity,
    retry: false,
  })
}

export function useLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: sessionApi.login,
    onMutate: () => client.cancelQueries({ queryKey: sessionKey }),
    onSuccess: (user) => {
      client.setQueryData(sessionKey, user)
    },
  })
}

export function useLogout() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['session-action'],
    mutationFn: sessionApi.logout,
    onMutate: () => client.cancelQueries({ queryKey: sessionKey }),
    onSuccess: () => {
      client.setQueryData(sessionKey, null)
    },
  })
}
