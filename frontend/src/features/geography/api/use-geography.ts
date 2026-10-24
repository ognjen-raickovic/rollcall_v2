import { useQuery } from '@tanstack/react-query'

import { geographyApi } from './geography-api'

export function useCountries() {
  return useQuery({
    queryKey: ['geography', 'countries'],
    queryFn: ({ signal }) => geographyApi.countries(signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function useCitySearch(countryCode: string, query: string, enabled = true) {
  const q = query.trim().slice(0, 80)
  return useQuery({
    queryKey: ['geography', 'cities', countryCode, q],
    queryFn: ({ signal }) => geographyApi.cities(countryCode, q, signal),
    enabled: enabled && /^[A-Z]{2}$/.test(countryCode),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
