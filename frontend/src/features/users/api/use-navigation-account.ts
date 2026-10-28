import { useAuth, useAccountIdentity } from './use-auth'
import { useAccountStatus } from './use-account-status'
import { usePublicProfile } from './use-profiles'

export function useNavigationAccount(prefer: 'username' | 'displayName' = 'username') {
  const auth = useAuth()
  const identity = useAccountIdentity()
  const status = useAccountStatus(auth.data?.id ?? null)
  const verified = Boolean(
    auth.data &&
    !auth.isPending &&
    !auth.error &&
    identity.data?.id === auth.data.id &&
    !identity.error &&
    status.data?.status === 'active' &&
    !status.error,
  )
  const profile = usePublicProfile(verified ? (auth.data?.id ?? '') : '')
  if (!verified) return null
  const matched = !profile.error && profile.data?.id === auth.data?.id ? profile.data : null
  return prefer === 'displayName'
    ? matched?.displayName.trim() || 'Account'
    : matched?.username?.trim() || matched?.displayName.trim() || 'Account'
}
