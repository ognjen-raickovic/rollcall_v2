import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { EVENT_DETAILS_QUERY_KEY } from '@/lib/query-keys'
import type { EventActionSession } from './event-write-dtos'
import { discussionApi, type DiscussionChange, type DiscussionKind } from './discussion-api'

export const discussionKey = (id: string, viewer: string | null) =>
  [...EVENT_DETAILS_QUERY_KEY, id, viewer, 'discussion'] as const
export function useDiscussion(
  id: string,
  kind: DiscussionKind,
  session: EventActionSession,
  parentId: string | null = null,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: [...discussionKey(id, session.viewerId), kind, parentId],
    queryFn: ({ pageParam, signal }) => discussionApi.list(id, kind, session, pageParam, parentId, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30_000,
  })
}
export function useDiscussionChange(id: string, kind: DiscussionKind, session: EventActionSession) {
  const client = useQueryClient()
  const current = () => client.getQueryData<{ id: string } | null>(['auth-account'])?.id === session.viewerId
  return useMutation({
    gcTime: 0,
    mutationKey: [...discussionKey(id, session.viewerId), kind],
    mutationFn: async (change: DiscussionChange) => {
      await client.cancelQueries({ queryKey: discussionKey(id, session.viewerId) })
      return discussionApi.change(id, kind, session, change)
    },
    onSettled: async () => {
      if (current()) await client.invalidateQueries({ queryKey: discussionKey(id, session.viewerId) })
    },
  })
}
