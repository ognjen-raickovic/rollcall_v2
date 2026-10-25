import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authClient, authConfigurationError } from '../api/auth-client'
import { sessionAccount } from '../api/auth-api'
import { authKey, recoveryKey } from '../api/use-auth'

const recoveryMarker = 'rollcall.password-recovery'

// Keep callbacks synchronous: awaiting another Auth call here can deadlock its lock.
export function AuthSessionSync() {
  const client = useQueryClient()
  useEffect(() => {
    if (authConfigurationError()) return
    const { data } = authClient().auth.onAuthStateChange((event, session) => {
      client.setQueryData(authKey, sessionAccount(session))
      if (session) client.setQueryData(['session'], null)
      if (event === 'PASSWORD_RECOVERY') {
        client.setQueryData(recoveryKey, true)
        try {
          sessionStorage.setItem(recoveryMarker, 'true')
        } catch {
          /* Optional storage. */
        }
      } else if (event === 'SIGNED_OUT') {
        client.setQueryData(recoveryKey, false)
        client.removeQueries({ queryKey: ['account-identity'] })
        client.removeQueries({ queryKey: ['events'] })
        try {
          sessionStorage.removeItem(recoveryMarker)
        } catch {
          /* Optional storage. */
        }
      } else if (event === 'INITIAL_SESSION' && session) {
        try {
          client.setQueryData(recoveryKey, sessionStorage.getItem(recoveryMarker) === 'true')
        } catch {
          /* Optional storage. */
        }
      }
      if (event === 'TOKEN_REFRESHED') void client.invalidateQueries({ queryKey: ['account-identity'] })
    })
    return () => data.subscription.unsubscribe()
  }, [client])
  return null
}
