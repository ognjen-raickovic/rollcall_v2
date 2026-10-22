import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { MockActor } from '@/lib/mock-db'

import type { EventFilters, NewEvent, UpdateEvent } from '../types'
import { eventsApi } from './events-api'

export function useEvents(filters: EventFilters = {}) {
  return useQuery({ queryKey: ['events', filters], queryFn: () => eventsApi.list(filters) })
}

export function useEvent(id: number, userId: number | null = null) {
  return useQuery({
    queryKey: ['events', id, userId],
    queryFn: () => eventsApi.get(id, { userId }),
    enabled: Number.isSafeInteger(id) && id > 0,
    retry: false,
  })
}

export function useCreateEvent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ input, actor }: { input: NewEvent; actor: MockActor }) => eventsApi.create(input, actor),
    onSuccess: (event, { actor }) => {
      client.setQueryData(['events', event.id, actor.userId], event)
      return client.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

export function useUpdateEvent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes, actor }: { id: number; changes: UpdateEvent; actor: MockActor }) =>
      eventsApi.update(id, changes, actor),
    onSuccess: (event, { actor }) => {
      client.setQueryData(['events', event.id, actor.userId], event)
      return client.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

export function useRemoveEvent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, actor }: { id: number; actor: MockActor }) => eventsApi.remove(id, actor),
    onSuccess: (_data, { id }) => {
      client.removeQueries({ queryKey: ['events', id] })
      return client.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

export function useJoinEvent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, actor }: { id: number; actor: MockActor }) => eventsApi.join(id, actor),
    onSuccess: (event, { actor }) => {
      client.setQueryData(['events', event.id, actor.userId], event)
      return client.invalidateQueries({ queryKey: ['events'] })
    },
    onError: () => client.invalidateQueries({ queryKey: ['events'] }),
  })
}

export function useLeaveEvent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, actor }: { id: number; actor: MockActor }) => eventsApi.leave(id, actor),
    onSuccess: (event, { actor }) => {
      client.setQueryData(['events', event.id, actor.userId], event)
      return client.invalidateQueries({ queryKey: ['events'] })
    },
    onError: () => client.invalidateQueries({ queryKey: ['events'] }),
  })
}
