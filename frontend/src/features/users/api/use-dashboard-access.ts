import { useCallback } from 'react'
import { z } from 'zod'
import { useAuth, useAccountIdentity } from './use-auth'
import { useAccountStatus } from './use-account-status'
import { usePermissions } from './use-administration'
import type { Permissions } from './administration-api'

export function dashboardAccessAllowed(value: {
  accountId: string | undefined
  identityId: string | undefined
  active: boolean
  permissions: Permissions | undefined
  pending: boolean
  failed: boolean
}) {
  return (
    !value.pending &&
    !value.failed &&
    z.uuid().safeParse(value.accountId).success &&
    value.identityId === value.accountId &&
    value.active &&
    (value.permissions?.role === 'admin' || value.permissions?.role === 'superadmin') &&
    value.permissions.capabilities.accessAdmin
  )
}

export function useDashboardAccess() {
  const auth = useAuth(),
    identity = useAccountIdentity(),
    status = useAccountStatus(auth.data?.id ?? null),
    permissions = usePermissions()
  const identityRefresh = identity.refetch,
    statusRefresh = status.refetch,
    permissionsRefresh = permissions.refetch
  const owner = auth.data?.id
  const refresh = useCallback(async () => {
    if (!owner) return
    await Promise.all([identityRefresh(), statusRefresh(), permissionsRefresh()])
  }, [owner, identityRefresh, statusRefresh, permissionsRefresh])
  return {
    allowed: dashboardAccessAllowed({
      accountId: owner,
      identityId: identity.data?.id,
      active: status.data?.status === 'active',
      permissions: permissions.data,
      pending:
        auth.isPending ||
        identity.isPending ||
        identity.isFetching ||
        status.isPending ||
        status.isFetching ||
        permissions.isPending ||
        permissions.isFetching,
      failed: Boolean(auth.error || identity.error || status.error || permissions.error),
    }),
    refresh,
  }
}
