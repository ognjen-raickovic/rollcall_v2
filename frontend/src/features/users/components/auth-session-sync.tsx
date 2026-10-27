import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authClient, authConfigurationError } from '../api/auth-client'
import { sessionAccount } from '../api/auth-api'
import { authKey, recoveryKey } from '../api/use-auth'
import { ACCOUNT_STATUS_QUERY_KEY, ADMIN_QUERY_KEY, EVENT_COVER_QUERY_KEY, EVENT_DETAILS_QUERY_KEY } from '@/lib/query-keys'

const recoveryMarker = 'rollcall.password-recovery'

// Keep callbacks synchronous: awaiting another Auth call here can deadlock its lock.
export function AuthSessionSync() {
  const client = useQueryClient()
  useEffect(() => {
    if (authConfigurationError()) return
    const { data } = authClient().auth.onAuthStateChange((event, session) => {
      const previous = client.getQueryData<{ id: string } | null>(authKey)
      if (previous?.id !== session?.user.id || event === 'SIGNED_OUT') {
        client.removeQueries({ queryKey: ['account-identity'] })
        client.removeQueries({ queryKey: ['my-events'] })
        client.removeQueries({ queryKey: ACCOUNT_STATUS_QUERY_KEY })
      client.removeQueries({ queryKey: ADMIN_QUERY_KEY })
        // Destroying queries aborts their consumed signals before a new account can render them.
        client.removeQueries({ queryKey: EVENT_DETAILS_QUERY_KEY })
        client.removeQueries({ queryKey: EVENT_COVER_QUERY_KEY })
        client.removeQueries({ queryKey: ['own-profile'] })
        client.removeQueries({ queryKey: ['profile-experience'] })
        client.removeQueries({ queryKey: ['public-profile'] })
      }
      client.setQueryData(authKey, sessionAccount(session))
      if (session) client.setQueryData(['session'], null)
      if (event === 'PASSWORD_RECOVERY') {
        client.removeQueries({ queryKey: ACCOUNT_STATUS_QUERY_KEY })
      client.removeQueries({ queryKey: ADMIN_QUERY_KEY })
        client.removeQueries({ queryKey: EVENT_DETAILS_QUERY_KEY })
        client.removeQueries({ queryKey: EVENT_COVER_QUERY_KEY })
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
      if (event === 'TOKEN_REFRESHED') { void client.invalidateQueries({ queryKey: ['account-identity'] }); void client.invalidateQueries({queryKey:ACCOUNT_STATUS_QUERY_KEY}) }
    })
    return () => data.subscription.unsubscribe()
  }, [client])
  return null
}
