import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { sessionApi } from './session-api'
import { demoModeEnabled } from './auth-client'
import { useAuth } from './use-auth'

const sessionKey = ['session'] as const

export function useSession() {
  const auth = useAuth()
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: demoModeEnabled ? sessionApi.get : async () => null,
    staleTime: Infinity,
    retry: false,
  })
  return auth.data || auth.isPending ? { ...session, data: null } : session
}

export function useLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => {
      if (!demoModeEnabled)
        return Promise.reject(
          new Error('Demo sessions are available only in explicitly enabled development mode.'),
        )
      if (client.getQueryData(['auth-account']))
        return Promise.reject(new Error('Log out of your real account before selecting a demo player.'))
      return sessionApi.login(userId)
    },
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
