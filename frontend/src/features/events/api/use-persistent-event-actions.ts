import { useMutation, useQueryClient, type QueryClient, type UseMutationOptions } from '@tanstack/react-query'

import { HttpError } from '@/lib/http-client'
import { notify, notifyFailure } from '@/lib/notifications'
import { EVENT_DETAILS_QUERY_KEY, EVENT_VIEWER_QUERY_KEY } from '@/lib/query-keys'
import { eventDetailsSchema, isEventId } from './event-dtos'
import type { EventDetails } from './event-dtos'
import type {
  AttendanceResult,
  CreateEventInput,
  EventActionSession,
  HostEventDetails,
  UpdateEventInput,
} from './event-write-dtos'
import { persistentEventActionsApi } from './persistent-event-actions-api'
import { persistentEventsApi } from './persistent-events-api'
import { invalidateEventCovers } from './use-persistent-event-covers'

type Envelope<T> = { value: T; session: EventActionSession }
type Owner = { viewerId: string }

function changedAccount() {
  return new HttpError(401, 'Your account changed. Reload this page before continuing.')
}

function current(client: QueryClient, viewerId: string | null): viewerId is string {
  return isEventId(viewerId) && client.getQueryData<{ id: string } | null>(['auth-account'])?.id === viewerId
}

function detailKey(id: string, viewerId: string) {
  return [...EVENT_DETAILS_QUERY_KEY, id, viewerId] as const
}

function invalidatePublic(client: QueryClient) {
  void client.invalidateQueries({ queryKey: EVENT_VIEWER_QUERY_KEY })
  void client.invalidateQueries({ queryKey: ['my-events'] })
  void client.invalidateQueries({ queryKey: ['persistent-events'] })
}

function removeOtherViewers(client: QueryClient, id: string, viewerId: string) {
  client.removeQueries({
    queryKey: [...EVENT_DETAILS_QUERY_KEY, id],
    predicate: (query) => query.queryKey[2] !== viewerId,
  })
}

async function cacheHost(client: QueryClient, event: HostEventDetails, session: EventActionSession) {
  await invalidateEventCovers(client, event.id, () => current(client, session.viewerId))
  await client.cancelQueries({ queryKey: [...EVENT_DETAILS_QUERY_KEY, event.id] })
  if (!current(client, session.viewerId)) return
  removeOtherViewers(client, event.id, session.viewerId)
  client.setQueryData(detailKey(event.id, session.viewerId), event)
  void client.invalidateQueries({ queryKey: detailKey(event.id, session.viewerId) })
  invalidatePublic(client)
}

async function cacheAttendance(client: QueryClient, result: AttendanceResult, session: EventActionSession) {
  await invalidateEventCovers(client, result.eventId, () => current(client, session.viewerId))
  await client.cancelQueries({ queryKey: [...EVENT_DETAILS_QUERY_KEY, result.eventId] })
  await Promise.all([
    client.cancelQueries({ queryKey: [...EVENT_VIEWER_QUERY_KEY, session.viewerId] }),
    client.cancelQueries({ queryKey: ['persistent-events'] }),
    client.cancelQueries({ queryKey: ['my-events', session.viewerId] }),
  ])
  if (!current(client, session.viewerId)) return
  const key = detailKey(result.eventId, session.viewerId)
  // Apply only acknowledged counts/self-state, never optimistic membership or addresses.
  client.setQueriesData<import('./event-viewer-api').EventViewerStatus[]>(
    { queryKey: [...EVENT_VIEWER_QUERY_KEY, session.viewerId] },
    (items) =>
      items?.map((item) =>
        item.eventId === result.eventId ? { ...item, hasJoined: result.hasJoined } : item,
      ),
  )
  const updatePage = (page: import('./event-dtos').EventPage) => ({
    ...page,
    items: page.items.map((item) =>
      item.id === result.eventId
        ? {
            ...item,
            capacity: result.capacity,
            participantCount: result.participantCount,
            availableSlots: result.availableSlots,
          }
        : item,
    ),
  })
  for (const queryKey of [['persistent-events'], ['my-events', session.viewerId]])
    client.setQueriesData<{ pages: import('./event-dtos').EventPage[]; pageParams: unknown[] }>(
      { queryKey },
      (data) => (data ? { ...data, pages: data.pages.map(updatePage) } : data),
    )
  removeOtherViewers(client, result.eventId, session.viewerId)
  const existing = client.getQueryData<EventDetails>(key)
  invalidatePublic(client)
  if (!result.hasJoined) {
    if (existing && existing.visibility !== 'private' && !existing.viewer.isHost) {
      // This is confirmed server state, not an optimistic attendance guess. Replacing
      // data also notifies active observers, unlike removing their query alone.
      const safe = eventDetailsSchema.parse({
        ...existing,
        capacity: result.capacity,
        participantCount: result.participantCount,
        availableSlots: result.availableSlots,
        viewer: { userId: session.viewerId, isHost: false, hasJoined: false },
        address: undefined,
      })
      client.setQueryData(key, safe)
      void client.invalidateQueries({ queryKey: key })
    } else {
      // A private departure intentionally has no readable DTO. Its controller hides
      // the old address during the request and navigates after acknowledgement.
      client.removeQueries({ queryKey: [...EVENT_DETAILS_QUERY_KEY, result.eventId] })
    }
    return
  }
  try {
    // Join returns no address. Read the actual authorized DTO rather than inventing
    // participant details from the safe attendance summary.
    await client.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) =>
        persistentEventsApi.get(result.eventId, session.viewerId, session.getAccessToken, signal),
      staleTime: 0,
      gcTime: 0,
      retry: false,
    })
  } catch {
    // The server already acknowledged the write. A failed refresh must not turn it
    // into a falsely failed mutation; the detail query exposes its own retry state.
  }
}

function actionOptions<TValue, TResult>(
  client: QueryClient,
  operation: string,
  execute: (value: TValue, session: EventActionSession, signal: AbortSignal) => Promise<TResult>,
  succeeded: (result: TResult, value: TValue, session: EventActionSession) => Promise<void>,
  eventId: (value: TValue) => string | undefined,
): UseMutationOptions<TResult, Error, Envelope<TValue>, Owner> {
  return {
    mutationKey: ['persistent-event-actions', operation],
    retry: false,
    // Forms and host responses can contain an address. Drop inactive mutation
    // payload/results as soon as their viewer-scoped controller unmounts.
    gcTime: 0,
    onMutate: ({ session }) => {
      if (!current(client, session.viewerId)) throw changedAccount()
      return { viewerId: session.viewerId }
    },
    mutationFn: async ({ value, session }) => {
      if (!current(client, session.viewerId)) throw changedAccount()
      const controller = new AbortController()
      const unsubscribe = client.getQueryCache().subscribe(() => {
        if (!current(client, session.viewerId)) controller.abort(changedAccount())
      })
      try {
        return await execute(value, session, controller.signal)
      } finally {
        unsubscribe()
      }
    },
    onSuccess: async (result, { value, session }, owner) => {
      if (!owner || owner.viewerId !== session.viewerId || !current(client, owner.viewerId)) return
      await succeeded(result, value, session)
      if (!current(client, session.viewerId)) return
      if (operation === 'delete') notify('event.deleted')
      if (operation === 'join') notify('event.joined')
      if (operation === 'leave') notify('event.left')
    },
    onError: async (error, { value, session }) => {
      if (current(client, session.viewerId) && operation !== 'create' && operation !== 'update')
        notifyFailure(error)
      if (!current(client, session.viewerId) || (error instanceof HttpError && error.status === 400)) return
      const id = eventId(value)
      if (id) await client.cancelQueries({ queryKey: [...EVENT_DETAILS_QUERY_KEY, id] })
      if (!current(client, session.viewerId)) return
      // Network failures may be ambiguous after a committed write. Read server truth
      // again; never optimistically claim a failed leave removed membership.
      if (id) void client.invalidateQueries({ queryKey: [...EVENT_DETAILS_QUERY_KEY, id] })
      invalidatePublic(client)
    },
  }
}

export function persistentCreateEventOptions(client: QueryClient) {
  return actionOptions<CreateEventInput, HostEventDetails>(
    client,
    'create',
    persistentEventActionsApi.create,
    (result, _input, session) => cacheHost(client, result, session),
    () => undefined,
  )
}

export function persistentUpdateEventOptions(client: QueryClient) {
  return actionOptions<{ id: string; input: UpdateEventInput }, HostEventDetails>(
    client,
    'update',
    ({ id, input }, session, signal) => persistentEventActionsApi.update(id, input, session, signal),
    (result, _value, session) => cacheHost(client, result, session),
    ({ id }) => id,
  )
}

export function persistentDeleteEventOptions(client: QueryClient) {
  return actionOptions<string, void>(
    client,
    'delete',
    persistentEventActionsApi.remove,
    async (_result, id, session) => {
      await invalidateEventCovers(client, id, () => current(client, session.viewerId))
      await client.cancelQueries({ queryKey: [...EVENT_DETAILS_QUERY_KEY, id] })
      if (!current(client, session.viewerId)) return
      client.removeQueries({ queryKey: [...EVENT_DETAILS_QUERY_KEY, id] })
      invalidatePublic(client)
    },
    (id) => id,
  )
}

export function persistentJoinEventOptions(client: QueryClient) {
  return actionOptions<string, AttendanceResult>(
    client,
    'join',
    persistentEventActionsApi.join,
    (result, _id, session) => cacheAttendance(client, result, session),
    (id) => id,
  )
}

export function persistentLeaveEventOptions(client: QueryClient) {
  return actionOptions<string, AttendanceResult>(
    client,
    'leave',
    persistentEventActionsApi.leave,
    (result, _id, session) => cacheAttendance(client, result, session),
    (id) => id,
  )
}

function useAction<TValue, TResult>(
  session: EventActionSession,
  options: (client: QueryClient) => UseMutationOptions<TResult, Error, Envelope<TValue>, Owner>,
) {
  const client = useQueryClient()
  const mutation = useMutation(options(client))
  const belongs =
    mutation.variables?.session.viewerId === session.viewerId && current(client, session.viewerId)
  function envelope(value: TValue): Envelope<TValue> {
    // Capture the session as a variable, not a mutable hook-option closure. A new
    // render/account cannot silently change the actor of an in-flight operation.
    return { value, session: { viewerId: session.viewerId, getAccessToken: session.getAccessToken } }
  }
  return {
    ...mutation,
    variables: belongs ? mutation.variables?.value : undefined,
    data: belongs ? mutation.data : undefined,
    error: belongs ? mutation.error : null,
    isPending: belongs && mutation.isPending,
    isSuccess: belongs && mutation.isSuccess,
    isError: belongs && mutation.isError,
    mutate: (value: TValue) => mutation.mutate(envelope(value)),
    mutateAsync: (value: TValue) => mutation.mutateAsync(envelope(value)),
  }
}

export function usePersistentCreateEvent(session: EventActionSession) {
  return useAction(session, persistentCreateEventOptions)
}
export function usePersistentUpdateEvent(session: EventActionSession) {
  return useAction(session, persistentUpdateEventOptions)
}
export function usePersistentDeleteEvent(session: EventActionSession) {
  return useAction(session, persistentDeleteEventOptions)
}
export function usePersistentJoinEvent(session: EventActionSession) {
  return useAction(session, persistentJoinEventOptions)
}
export function usePersistentLeaveEvent(session: EventActionSession) {
  return useAction(session, persistentLeaveEventOptions)
}
