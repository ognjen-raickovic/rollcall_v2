import { useInfiniteQuery } from '@tanstack/react-query'
import { HttpError, httpRequest } from '@/lib/http-client'
import { myEventPageSchema } from './event-dtos'

export function useMyEvents(
  viewerId: string | null,
  getAccessToken: () => Promise<string | null>,
  relation: 'hosting' | 'joined',
  period: 'upcoming' | 'past' | 'all',
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: ['my-events', viewerId, relation, period],
    initialPageParam: null as string | null,
    enabled: enabled && Boolean(viewerId),
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchInterval: 30000,
    queryFn: async ({ pageParam, signal }) => {
      const token = await getAccessToken()
      if (!token || !viewerId) throw new HttpError(401, 'Log in to see your events.')
      const params = new URLSearchParams({
        relation,
        period,
        sort: period === 'past' ? 'latest' : 'soonest',
        limit: '12',
      })
      if (pageParam) params.set('cursor', pageParam)
      const result = await httpRequest(`/api/me/events?${params}`, myEventPageSchema, {
        token,
        viewerId,
        signal,
        resource: 'event',
      })
      if (signal.aborted || !(await getAccessToken()))
        throw new HttpError(401, 'Your account changed. Reload your events.')
      return result
    },
    getNextPageParam: (page) => page.pageInfo.nextCursor,
  })
}
