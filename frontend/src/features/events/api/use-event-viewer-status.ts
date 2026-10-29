import { useQuery } from '@tanstack/react-query'
import { EVENT_VIEWER_QUERY_KEY } from '@/lib/query-keys'
import { eventViewerApi } from './event-viewer-api'
import type { EventBrowseSession } from './event-viewer-api'

export function useEventViewerStatus(ids: string[], session: EventBrowseSession) {
  const eventIds = [...new Set(ids)].sort()
  return useQuery({
    queryKey: [...EVENT_VIEWER_QUERY_KEY, session.viewerId, eventIds],
    queryFn: async ({ signal }) => {
      const items = []
      for (let offset = 0; offset < eventIds.length; offset += 50)
        items.push(
          ...(await eventViewerApi.get(eventIds.slice(offset, offset + 50), session, signal)).items,
        )
      return items
    },
    enabled: Boolean(session.viewerId && session.ready !== false && !session.error && eventIds.length),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: 'always',
  })
}
