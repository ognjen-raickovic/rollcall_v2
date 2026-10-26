import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { EVENT_COVER_QUERY_KEY, EVENT_DETAILS_QUERY_KEY } from '@/lib/query-keys'
import { HttpError } from '@/lib/http-client'
import { isEventId, type EventDetails } from './event-dtos'
import type { EventActionSession } from './event-write-dtos'
import { persistentEventCoversApi, type CoverMutationResult } from './persistent-event-covers-api'

export const anonymousCoverSession: EventActionSession = {
  viewerId: null,
  getAccessToken: async () => null,
}

function current(client: QueryClient, session: EventActionSession) {
  return (
    isEventId(session.viewerId) &&
    client.getQueryData<{ id: string } | null>(['auth-account'])?.id === session.viewerId
  )
}

function changedAccount() {
  return new HttpError(401, 'Your account changed. Reload this page before continuing.')
}

export function persistentCoverQueryOptions(
  id: string,
  version: string,
  session: EventActionSession = anonymousCoverSession,
  enabled = true,
) {
  return {
    queryKey: [...EVENT_COVER_QUERY_KEY, id, session.viewerId, version] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      persistentEventCoversApi.get(id, version, session, signal),
    enabled: enabled && isEventId(id) && isEventId(version),
    retry: false,
    staleTime: 40000,
    gcTime: 0,
    refetchInterval: 45000,
    refetchIntervalInBackground: false,
  }
}

export function usePersistentEventCover(
  id: string,
  version: string,
  session: EventActionSession = anonymousCoverSession,
  enabled = true,
) {
  return useQuery(persistentCoverQueryOptions(id, version, session, enabled))
}

export async function invalidateEventCovers(client: QueryClient, id: string, allowed = () => true) {
  if (!allowed()) return
  await client.cancelQueries({ queryKey: [...EVENT_COVER_QUERY_KEY, id] })
  if (!allowed()) return
  client.removeQueries({ queryKey: [...EVENT_COVER_QUERY_KEY, id] })
}

type CoverWrite = { id: string; file?: File; session: EventActionSession }

export function persistentCoverMutationOptions(client: QueryClient) {
  return {
    mutationKey: ['persistent-event-cover-write'],
    retry: false,
    gcTime: 0,
    mutationFn: async ({ id, file, session }: CoverWrite) => {
      if (!current(client, session)) throw changedAccount()
      const controller = new AbortController()
      const unsubscribe = client.getQueryCache().subscribe(() => {
        if (!current(client, session)) controller.abort(changedAccount())
      })
      try {
        return file
          ? await persistentEventCoversApi.upload(id, file, session, controller.signal)
          : await persistentEventCoversApi.remove(id, session, controller.signal)
      } finally {
        unsubscribe()
      }
    },
    onSuccess: async (result: CoverMutationResult, { id, session }: CoverWrite) => {
      if (!current(client, session)) return
      await invalidateEventCovers(client, id, () => current(client, session))
      await client.cancelQueries({ queryKey: [...EVENT_DETAILS_QUERY_KEY, id] })
      if (!current(client, session)) return
      const key = [...EVENT_DETAILS_QUERY_KEY, id, session.viewerId]
      const existing = client.getQueryData<EventDetails>(key)
      if (existing) client.setQueryData(key, { ...existing, cover: result.cover })
      void client.invalidateQueries({ queryKey: [...EVENT_DETAILS_QUERY_KEY, id] })
      void client.invalidateQueries({ queryKey: ['persistent-events'] })
    },
    onError: async (_error: Error, { id, session }: CoverWrite) => {
      if (!current(client, session)) return
      // The request may have committed before a response was lost. Re-read truth;
      // retain the existing working cover rather than inventing a successful upload.
      await client.cancelQueries({ queryKey: [...EVENT_DETAILS_QUERY_KEY, id] })
      if (!current(client, session)) return
      void client.invalidateQueries({ queryKey: [...EVENT_DETAILS_QUERY_KEY, id] })
      void client.invalidateQueries({ queryKey: ['persistent-events'] })
    },
  }
}

export function usePersistentCoverMutation(session: EventActionSession) {
  const client = useQueryClient()
  const mutation = useMutation(persistentCoverMutationOptions(client))
  const belongs = mutation.variables?.session.viewerId === session.viewerId && current(client, session)
  return {
    ...mutation,
    isPending: belongs && mutation.isPending,
    error: belongs ? mutation.error : null,
    data: belongs ? mutation.data : undefined,
    mutateAsync: (input: { id: string; file?: File }) =>
      mutation.mutateAsync({
        ...input,
        session: { viewerId: session.viewerId, getAccessToken: session.getAccessToken },
      }),
  }
}
