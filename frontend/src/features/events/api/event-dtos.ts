import { z } from 'zod'

import { EVENT_TAGS } from '../event-tags'

const referenceId = z.number().int().min(1).max(2147483647)
const instant = z.iso.datetime({ offset: true })
const category = z.enum(['role-playing', 'trading-card', 'board-game', 'social-deduction'])
const tags = z
  .array(z.enum(EVENT_TAGS))
  .max(6)
  .refine((value) => new Set(value).size === value.length)
const defaultImage = z.enum([
  '/images/role-playing.svg',
  '/images/trading-card.svg',
  '/images/board-games.svg',
  '/images/social-deduction.svg',
])
export const eventCoverSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('default'), imageUrl: defaultImage }),
  // This is a stable reference and fallback, never a retained signed capability.
  z.object({ kind: z.literal('custom'), version: z.uuid(), imageUrl: defaultImage }),
])
export type EventCover = z.infer<typeof eventCoverSchema>
const summaryFields = {
  id: z.uuid(),
  title: z.string().min(3).max(100),
  game: z.object({ id: referenceId, name: z.string().min(2).max(100), category }),
  city: z.object({
    id: referenceId,
    name: z.string().min(1).max(200),
    administrativeDivision: z.string().nullable(),
  }),
  country: z.object({ id: referenceId, isoCode: z.string().regex(/^[A-Z]{2}$/), name: z.string() }),
  venue: z.string().min(2).max(120).nullable(),
  startsAt: instant,
  endsAt: instant,
  capacity: z.number().int().min(1).max(100),
  participantCount: z.number().int().min(0).max(100),
  availableSlots: z.number().int().min(0).max(100),
  tags,
  visibility: z.enum(['public', 'unlisted', 'private']),
  status: z.enum(['scheduled', 'cancelled']),
  cover: eventCoverSchema,
}

function validSummary(value: {
  capacity: number
  participantCount: number
  availableSlots: number
  startsAt: string
  endsAt: string
}): boolean {
  return (
    value.availableSlots === value.capacity - value.participantCount &&
    Date.parse(value.endsAt) > Date.parse(value.startsAt)
  )
}

export const eventSummarySchema = z
  .object({ ...summaryFields, visibility: z.literal('public'), status: z.literal('scheduled') })
  .refine(validSummary)
export const myEventSummarySchema = z.object(summaryFields).refine(validSummary)
export type MyEventSummary = z.infer<typeof myEventSummarySchema>
export const myEventPageSchema = z.object({
  items: z.array(myEventSummarySchema).max(50),
  pageInfo: z.object({ limit: z.number().int().min(1).max(50), nextCursor: z.string().max(1024).nullable() }),
})
export const eventPageSchema = z.object({
  items: z.array(eventSummarySchema).max(50),
  pageInfo: z.object({
    limit: z.number().int().min(1).max(50),
    nextCursor: z
      .string()
      .min(1)
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/)
      .nullable(),
  }),
})

const detailFields = {
  ...summaryFields,
  description: z.string().min(10).max(5000),
  host: z.object({ id: z.uuid(), displayName: z.string().min(2).max(80) }),
  minimumAge: z.number().int().min(0).max(99),
  experienceLevel: z.enum(['all-levels', 'beginner', 'experienced']),
  price: z.number().min(0).max(10000).multipleOf(0.01),
  currency: z.literal('EUR'),
  createdAt: instant,
  updatedAt: instant,
}
const publicDetail = z.object({
  ...detailFields,
  visibility: z.enum(['public', 'unlisted']),
  viewer: z.object({ userId: z.uuid().nullable(), isHost: z.literal(false), hasJoined: z.literal(false) }),
})
const hostDetail = z.object({
  ...detailFields,
  viewer: z.object({ userId: z.uuid(), isHost: z.literal(true), hasJoined: z.literal(false) }),
  address: z.string().min(3).max(200),
})
const participantDetail = z
  .object({
    ...detailFields,
    viewer: z.object({ userId: z.uuid(), isHost: z.literal(false), hasJoined: z.literal(true) }),
    address: z.string().min(3).max(200),
  })
  .refine((value) => value.participantCount > 0)

// The public branch strips even an accidentally supplied address. Authorized branches
// require both the explicit viewer relationship and a valid protected field.
export const eventDetailsSchema = z
  .union([hostDetail, participantDetail, publicDetail])
  .refine(validSummary)
  .refine((value) => value.viewer.isHost === (value.host.id === value.viewer.userId))

export const eventDiscoveryFiltersSchema = z
  .strictObject({
    search: z.string().trim().max(100).optional(),
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase())
      .optional(),
    cityId: referenceId.optional(),
    gameId: referenceId.optional(),
    startsAfter: instant.optional(),
    startsBefore: instant.optional(),
    startsBeforeExclusive: z.boolean().optional(),
    sort: z.enum(['soonest', 'latest', 'title-asc', 'title-desc']).optional(),
    period: z.enum(['upcoming', 'past', 'all']).optional(),
    availability: z.enum(['all', 'open', 'full']).optional(),
    category: category.optional(),
    tags: z
      .array(z.enum(EVENT_TAGS))
      .max(6)
      .refine((value) => new Set(value).size === value.length)
      .optional(),
    experience: z.enum(['all-levels', 'beginner', 'experienced']).optional(),
    maxMinimumAge: z.number().int().min(0).max(99).optional(),
    timeFrom: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    timeTo: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    timeZone: z.string().min(1).max(100).optional(),
    upcomingOnly: z.boolean().optional(),
    availableOnly: z.boolean().optional(),
    status: z.literal('scheduled').optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .refine(
    (value) =>
      !value.startsAfter ||
      !value.startsBefore ||
      Date.parse(value.startsAfter) <= Date.parse(value.startsBefore),
  )
  .refine((value) => !(value.availableOnly && value.availability === 'full'))
  .refine((value) => !(value.timeFrom || value.timeTo) || Boolean(value.timeZone))
  .refine((value) => !value.timeFrom || !value.timeTo || value.timeFrom <= value.timeTo)

export type EventSummary = z.infer<typeof eventSummarySchema>
export type EventDetails = z.infer<typeof eventDetailsSchema>
export type EventPage = z.infer<typeof eventPageSchema>
export type EventDiscoveryFilters = z.infer<typeof eventDiscoveryFiltersSchema>

export function isEventId(value: unknown): value is string {
  return z.uuid().safeParse(value).success
}
