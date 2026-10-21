import { useQuery } from '@tanstack/react-query'

import { listingsApi } from './listings-api'

export function useListings(search: string) {
  return useQuery({
    queryKey: ['listings', search],
    queryFn: () => listingsApi.list(search),
  })
}
