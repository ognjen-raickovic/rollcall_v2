import { useQuery } from '@tanstack/react-query'
import { catalogApi } from './catalog-api'

export function useCatalogGames() {
  return useQuery({
    queryKey: ['catalog-games'],
    queryFn: ({ signal }) => catalogApi.list(signal),
    staleTime: 300_000,
    retry: false,
  })
}
