import { z } from 'zod'

import {
  ApiError,
  mockReferences,
  mockRequest,
  NotFoundError,
  requireMockUser,
  validate,
  validateId,
} from '@/lib/mock-db'
import type { MockActor } from '@/lib/mock-db'

import type { Event, EventFilters, NewEvent, UpdateEvent } from '../types'
import { mockEvents } from './mock-events'

const timestamp = z.iso.datetime({ offset: true })
const eventFields = z.strictObject({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(5000),
  gameId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  city: z.string().trim().min(2).max(80),
  venue: z.string().trim().min(2).max(120),
  address: z.string().trim().min(3).max(200),
  startsAt: timestamp,
  endsAt: timestamp,
  capacity: z.number().int().min(1).max(100),
  experienceLevel: z.enum(['all-levels', 'beginner', 'experienced']),
  price: z.number().min(0).max(10000).multipleOf(0.01),
  imageUrl: z
    .url({ protocol: /^https?$/ })
    .max(2000)
    .nullable(),
})
const updateSchema = eventFields
  .extend({ status: z.enum(['scheduled', 'cancelled']) })
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), 'Supply at least one field.')
const filtersSchema = z
  .strictObject({
    search: z.string().trim().max(100).optional(),
    city: z.string().trim().max(80).optional(),
    gameId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    startsAfter: timestamp.optional(),
    startsBefore: timestamp.optional(),
    availableOnly: z.boolean().optional(),
    status: z.enum(['scheduled', 'cancelled']).optional(),
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

function validateEvent(input: NewEvent) {
  if (!mockReferences.gameIds.has(input.gameId)) {
    throw new ApiError('VALIDATION_ERROR', 400, 'Choose an existing game.', {
      gameId: ['Game does not exist.'],
    })
  }
  if (Date.parse(input.startsAt) <= Date.now()) {
    throw new ApiError('VALIDATION_ERROR', 400, 'The start must be in the future.', {
      startsAt: ['Choose a future time.'],
    })
  }
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    throw new ApiError('VALIDATION_ERROR', 400, 'The end must follow the start.', {
      endsAt: ['End must be after start.'],
    })
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
            `${event.title} ${event.description} ${event.venue}`.toLowerCase().includes(search) &&
            (!input.city || event.city.toLowerCase() === input.city.toLowerCase()) &&
            (input.gameId === undefined || event.gameId === input.gameId) &&
            (!input.status || event.status === input.status) &&
            (!input.startsAfter || Date.parse(event.startsAt) >= Date.parse(input.startsAfter)) &&
            (!input.startsBefore || Date.parse(event.startsAt) <= Date.parse(input.startsBefore)) &&
            (!input.availableOnly ||
              (event.status === 'scheduled' &&
                Date.parse(event.startsAt) > Date.now() &&
                event.attendeeIds.length < event.capacity)),
        )
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id - b.id)
    }),

  get: (id: number): Promise<Event> => mockRequest(() => findEvent(id)),

  create: (input: NewEvent, actor: MockActor): Promise<Event> =>
    mockRequest(() => {
      const organizerId = requireMockUser(actor)
      const values = validate(eventFields, input)
      validateEvent(values)
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
      const values = validate(updateSchema, changes)
      const definedValues = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== undefined),
      )
      const updated: Event = { ...event, ...definedValues }
      validateEvent(updated)
      if (updated.capacity < event.attendeeIds.length)
        throw new ApiError('CONFLICT', 409, 'Capacity cannot be below current attendance.')
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
      requireOpenEvent(event)
      if (event.organizerId === actorId)
        throw new ApiError('CONFLICT', 409, 'The organizer cannot leave their own event.')
      if (!event.attendeeIds.includes(actorId)) return event
      event.attendeeIds = event.attendeeIds.filter((userId) => userId !== actorId)
      event.updatedAt = new Date().toISOString()
      return event
    }),
}
