import { z } from 'zod'

import {
  ApiError,
  mockRequest,
  NotFoundError,
  requireMockUser,
  validate,
  validateId,
} from '@/lib/mock-db'
import type { MockActor } from '@/lib/mock-db'

import type { Event, EventFilters, NewEvent, UpdateEvent } from '../types'
import { mockEvents } from './mock-events'
import { editableEventValues, newEventSchema, updateEventSchema } from './event-validation'

const timestamp = z.iso.datetime({ offset: true })
const filtersSchema = z
  .strictObject({
    search: z.string().trim().max(100).optional(),
    city: z.string().trim().max(200).optional(),
    country: z
      .string()
      .trim()
      .regex(/^([A-Za-z]{2})?$/)
      .transform((value) => value.toUpperCase())
      .optional(),
    cityId: z.number().int().positive().max(2147483647).optional(),
    gameId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    startsAfter: timestamp.optional(),
    startsBefore: timestamp.optional(),
    availableOnly: z.boolean().optional(),
    status: z.enum(['scheduled', 'cancelled']).optional(),
    visibility: z.enum(['public', 'unlisted']).optional(),
    upcomingOnly: z.boolean().optional(),
  })
  .refine(
    (value) =>
      !value.startsAfter ||
      !value.startsBefore ||
      Date.parse(value.startsAfter) <= Date.parse(value.startsBefore),
    'Date range is reversed.',
  )

let events = structuredClone(mockEvents)
let nextId = Math.max(...events.map((event) => event.id)) + 1

function normalizedCity(value: string): string {
  return value.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function matchesLocation(event: Event, input: EventFilters): boolean {
  const country = event.location?.countryIsoCode ?? event.countryCode ?? 'ME'
  if (input.country && country !== input.country) return false
  if (input.cityId !== undefined) {
    if (event.location) return event.location.cityId === input.cityId
    // Legacy fixtures have names, not invented DB IDs. Scope their name bridge to
    // Montenegro, and only use it when a selected city supplied both ID and label.
    return (
      input.country === 'ME' &&
      Boolean(input.city) &&
      normalizedCity(event.city) === normalizedCity(input.city ?? '')
    )
  }
  return !input.city || normalizedCity(event.city) === normalizedCity(input.city)
}

function findEvent(id: number): Event {
  validateId(id)
  const event = events.find((item) => item.id === id)
  if (!event) throw new NotFoundError('Event', id)
  return event
}

function requireOrganizer(event: Event, actorId: number) {
  if (event.organizerId !== actorId)
    throw new ApiError('FORBIDDEN', 403, 'Only the organizer can change this event.')
}

function requirePrivateAccess(event: Event, actor: MockActor) {
  if (event.visibility !== 'private') return
  const userId = requireMockUser(actor)
  if (event.organizerId !== userId && !event.attendeeIds.includes(userId)) {
    throw new ApiError(
      'FORBIDDEN',
      403,
      'Only the host and current participants can view this private event.',
    )
  }
}

function requireOpenEvent(event: Event) {
  if (event.status !== 'scheduled' || Date.parse(event.startsAt) <= Date.now()) {
    throw new ApiError('CONFLICT', 409, 'Attendance can only change before a scheduled event starts.')
  }
}

export const eventsApi = {
  list: (filters: EventFilters = {}): Promise<Event[]> =>
    mockRequest(() => {
      const input = validate(filtersSchema, filters)
      const search = (input.search ?? '').toLowerCase()
      return events
        .filter(
          (event) =>
            event.title.toLowerCase().includes(search) &&
            event.visibility === (input.visibility ?? 'public') &&
            matchesLocation(event, input) &&
            (input.gameId === undefined || event.gameId === input.gameId) &&
            (!input.status || event.status === input.status) &&
            (!input.upcomingOnly ||
              (event.status === 'scheduled' && Date.parse(event.startsAt) > Date.now())) &&
            (!input.startsAfter || Date.parse(event.startsAt) >= Date.parse(input.startsAfter)) &&
            (!input.startsBefore || Date.parse(event.startsAt) <= Date.parse(input.startsBefore)) &&
            (!input.availableOnly ||
              (event.status === 'scheduled' &&
                Date.parse(event.startsAt) > Date.now() &&
                event.attendeeIds.length < event.capacity)),
        )
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id - b.id)
    }),

  get: (id: number, actor: MockActor = { userId: null }): Promise<Event> =>
    mockRequest(() => {
      const event = findEvent(id)
      requirePrivateAccess(event, actor)
      return event
    }),

  create: (input: NewEvent, actor: MockActor): Promise<Event> =>
    mockRequest(() => {
      const organizerId = requireMockUser(actor)
      const values = validate(newEventSchema, input)
      if (
        ['beginner', 'experienced'].includes(values.experienceLevel) ||
        values.tags.some((tag) => tag === 'Beginner friendly' || tag === 'Veterans only')
      )
        throw new ApiError(
          'VALIDATION_ERROR',
          400,
          'Choose a current experience recommendation and non-legacy tags.',
        )
      const now = new Date().toISOString()
      const event: Event = {
        ...values,
        id: nextId++,
        organizerId,
        attendeeIds: [],
        status: 'scheduled',
        createdAt: now,
        updatedAt: now,
      }
      events.push(event)
      return event
    }),

  update: (id: number, changes: UpdateEvent, actor: MockActor): Promise<Event> =>
    mockRequest(() => {
      const actorId = requireMockUser(actor)
      const event = findEvent(id)
      requireOrganizer(event, actorId)
      const values = validate(updateEventSchema, changes)
      const definedValues = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== undefined),
      )
      const updated: Event = { ...event, ...definedValues }
      if (
        updated.experienceLevel !== event.experienceLevel &&
        ['beginner', 'experienced'].includes(updated.experienceLevel)
      )
        throw new ApiError('VALIDATION_ERROR', 400, 'Choose a current experience recommendation.')
      if (
        (updated.experienceLevel !== event.experienceLevel ||
          JSON.stringify(updated.tags) !== JSON.stringify(event.tags)) &&
        updated.tags.some((tag) => tag === 'Beginner friendly' || tag === 'Veterans only')
      )
        throw new ApiError(
          'VALIDATION_ERROR',
          400,
          'Remove legacy experience tags before changing tags or recommendations.',
        )
      validate(newEventSchema, editableEventValues(updated))
      if (updated.capacity < event.attendeeIds.length)
        throw new ApiError('CONFLICT', 409, 'Capacity cannot be below current attendance.', {
          capacity: [`At least ${event.attendeeIds.length} player seats are already taken.`],
        })
      updated.updatedAt = new Date().toISOString()
      events = events.map((item) => (item.id === id ? updated : item))
      return updated
    }),

  remove: (id: number, actor: MockActor): Promise<void> =>
    mockRequest(() => {
      const actorId = requireMockUser(actor)
      const event = findEvent(id)
      requireOrganizer(event, actorId)
      events = events.filter((item) => item.id !== id)
    }),

  join: (id: number, actor: MockActor): Promise<Event> =>
    mockRequest(() => {
      const actorId = requireMockUser(actor)
      const event = findEvent(id)
      requirePrivateAccess(event, actor)
      requireOpenEvent(event)
      if (event.organizerId === actorId)
        throw new ApiError('CONFLICT', 409, 'The organizer does not occupy a player seat.')
      if (event.attendeeIds.includes(actorId)) return event
      if (event.attendeeIds.length >= event.capacity)
        throw new ApiError('CONFLICT', 409, 'This event is full.')
      event.attendeeIds.push(actorId)
      event.updatedAt = new Date().toISOString()
      return event
    }),

  leave: (id: number, actor: MockActor): Promise<Event> =>
    mockRequest(() => {
      const actorId = requireMockUser(actor)
      const event = findEvent(id)
      requirePrivateAccess(event, actor)
      requireOpenEvent(event)
      if (event.organizerId === actorId)
        throw new ApiError('CONFLICT', 409, 'The organizer cannot leave their own event.')
      if (!event.attendeeIds.includes(actorId)) return event
      event.attendeeIds = event.attendeeIds.filter((userId) => userId !== actorId)
      event.updatedAt = new Date().toISOString()
      return event
    }),
}
