import { infiniteQueryOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query'

import { EVENT_DETAILS_QUERY_KEY } from '@/lib/query-keys'

import { eventDiscoveryFiltersSchema, isEventId } from './event-dtos'
import type { EventDiscoveryFilters } from './event-dtos'
import { persistentEventsApi } from './persistent-events-api'

export function persistentEventsQueryOptions(
  filters: EventDiscoveryFilters = {},
  enabled = true,
  scope = '',
) {
  const parsed = eventDiscoveryFiltersSchema.safeParse(filters)
  const normalized = parsed.success ? parsed.data : filters
  return infiniteQueryOptions({
    queryKey: ['persistent-events', normalized, scope],
    queryFn: ({ pageParam, signal }) => persistentEventsApi.list(normalized, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor,
    enabled: enabled && parsed.success,
    retry: false,
    staleTime: 30_000,
    // Returning to a previous URL filter starts at its first page, rather than
    // restoring a previously accumulated multi-page discovery result.
    gcTime: 0,
  })
}

export function usePersistentEvents(filters: EventDiscoveryFilters = {}, enabled = true, scope = '') {
  return useInfiniteQuery(persistentEventsQueryOptions(filters, enabled, scope))
}

export function usePersistentEvent(
  eventId: string | undefined,
  viewerId: string | null,
  getAccessToken: () => Promise<string | null>,
  enabled = true,
) {
  return useQuery({
    queryKey: [...EVENT_DETAILS_QUERY_KEY, eventId ?? null, viewerId],
    queryFn: ({ signal }) => persistentEventsApi.get(eventId ?? '', viewerId, getAccessToken, signal),
    enabled: enabled && isEventId(eventId),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })
}
