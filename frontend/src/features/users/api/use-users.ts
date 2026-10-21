import { useQuery } from '@tanstack/react-query'

import type { UserFilters } from '../types'
import { usersApi } from './users-api'

export function useUsers(filters: UserFilters = {}) {
  return useQuery({ queryKey: ['users', filters], queryFn: () => usersApi.list(filters) })
}

export function useUser(id: number) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => usersApi.get(id),
    enabled: Number.isSafeInteger(id) && id > 0,
  })
}
