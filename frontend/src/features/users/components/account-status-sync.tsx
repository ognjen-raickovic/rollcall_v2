import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ACCOUNT_STATUS_QUERY_KEY,
  ADMIN_QUERY_KEY,
  EVENT_DETAILS_QUERY_KEY,
  EVENT_COVER_QUERY_KEY,
  EVENT_VIEWER_QUERY_KEY,
} from '@/lib/query-keys'
import { useAuth } from '../api/use-auth'
import { useAccountStatus } from '../api/use-account-status'
export function AccountStatusSync() {
  const auth = useAuth(),
    viewer = auth.data?.id ?? null,
    status = useAccountStatus(viewer),
    client = useQueryClient(),
    current = useRef(viewer)
  current.current = viewer
  useEffect(() => {
    const onSuspended = (event: Event) => {
      const id = (event as CustomEvent<{ viewerId?: string }>).detail?.viewerId
      if (
        id &&
        id === current.current &&
        client.getQueryData<{ id: string }>(['auth-account'])?.id === id
      )
        client.setQueryData([...ACCOUNT_STATUS_QUERY_KEY, id], { status: 'suspended' })
    }
    window.addEventListener('rollcall:account-suspended', onSuspended)
    return () => window.removeEventListener('rollcall:account-suspended', onSuspended)
  }, [client])
  useEffect(() => {
    if (status.data?.status !== 'suspended') return
    for (const key of [
      ADMIN_QUERY_KEY,
      EVENT_DETAILS_QUERY_KEY,
      EVENT_COVER_QUERY_KEY,
      EVENT_VIEWER_QUERY_KEY,
      ['own-profile'],
      ['profile-experience'],
      ['account-identity'],
      ['my-events'],
    ])
      client.removeQueries({ queryKey: key })
  }, [status.data?.status, viewer, client])
  return null
}
