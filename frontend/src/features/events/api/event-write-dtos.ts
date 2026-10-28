import { z } from 'zod'

import { EVENT_TAGS, tagMatchesExperience, tagConflict } from '../event-tags'
import { eventDetailsSchema } from './event-dtos'

const referenceId = z.number().int().min(1).max(2147483647)
const instant = z.iso.datetime({ offset: true })
const experience = z.enum(['all-levels', 'beginner', 'experienced', 'intermediate-plus', 'veteran-plus'])
const tags = z
  .array(z.enum(EVENT_TAGS))
  .max(6)
  .refine((value) => new Set(value).size === value.length, 'Choose each tag only once.')
  .refine(
    (value) => !(value.includes('Beginner friendly') && value.includes('Veterans only')),
    'Beginner friendly and Veterans only cannot be combined.',
  )
const venue = z
  .string()
  .trim()
  .max(120)
  .refine(
    (value) => value === '' || value.length >= 2,
    'Use at least 2 characters or leave venue blank.',
  )
  .transform((value) => value || null)
  .nullable()
const fields = {
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(100, 'Use at most 100 characters.'),
  description: z.string().trim().min(10, 'Use at least 10 characters.').max(5000),
  gameId: referenceId,
  cityId: referenceId,
  venue,
  address: z.string().trim().min(3, 'Use at least 3 characters.').max(200),
  startsAt: instant,
  endsAt: instant,
  capacity: z.number().int().min(1).max(100),
  minimumAge: z.number().int().min(0).max(99),
  experienceLevel: experience,
  price: z.number().min(0).max(10000).multipleOf(0.01),
  tags,
  visibility: z.enum(['public', 'unlisted', 'private']),
  coverStoragePath: z.null(),
}

function checkValues(
  value: {
    startsAt?: string
    endsAt?: string
    tags?: z.infer<typeof tags>
    experienceLevel?: z.infer<typeof experience>
  },
  context: z.RefinementCtx,
) {
  if (value.tags && tagConflict(value.tags))
    context.addIssue({
      code: 'custom',
      path: ['tags'],
      message: tagConflict(value.tags) ?? 'Choose compatible tags.',
    })
  if (value.startsAt !== undefined && Date.parse(value.startsAt) <= Date.now())
    context.addIssue({ code: 'custom', path: ['startsAt'], message: 'Choose a future start time.' })
  if (
    value.startsAt !== undefined &&
    value.endsAt !== undefined &&
    Date.parse(value.endsAt) <= Date.parse(value.startsAt)
  )
    context.addIssue({ code: 'custom', path: ['endsAt'], message: 'End time must be after the start.' })
  if (
    value.tags &&
    value.experienceLevel &&
    !value.tags.every((tag) => tagMatchesExperience(tag, value.experienceLevel ?? 'all-levels'))
  )
    context.addIssue({
      code: 'custom',
      path: ['tags'],
      message: 'Choose tags compatible with experience.',
    })
}

// Complete editable content, including unchanged historical rules on edit.
export const eventContentInputSchema = z
  .strictObject({
    ...fields,
    venue: venue.default(null),
    minimumAge: fields.minimumAge.default(0),
    price: fields.price.default(0),
    tags: tags.default([]),
    visibility: fields.visibility.default('public'),
    coverStoragePath: fields.coverStoragePath.default(null),
  })
  .superRefine(checkValues)

export const createEventInputSchema = eventContentInputSchema
  .refine((value) => !['beginner', 'experienced'].includes(value.experienceLevel), {
    path: ['experienceLevel'],
    message: 'Choose a current recommended experience level.',
  })
  .refine((value) => !value.tags.some((tag) => tag === 'Beginner friendly' || tag === 'Veterans only'), {
    path: ['tags'],
    message: 'Use the experience selector instead of legacy experience tags.',
  })

// No patch defaults: omitted values must retain their stored meaning. PostgreSQL
// additionally validates final merged dates/tags and current attendance capacity.
export const updateEventInputSchema = z
  .strictObject({ ...fields, status: z.enum(['scheduled', 'cancelled']) })
  .partial()
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    'Supply at least one change.',
  )
  .superRefine(checkValues)

export const hostEventDetailsSchema = eventDetailsSchema.transform((event, context) => {
  if (!event.viewer.isHost || event.viewer.hasJoined || !('address' in event)) {
    context.addIssue({ code: 'custom', message: 'Expected verified host details.' })
    return z.NEVER
  }
  return {
    ...event,
    address: event.address,
    viewer: {
      userId: z.uuid().parse(event.viewer.userId),
      isHost: true as const,
      hasJoined: false as const,
    },
  }
})

export const attendanceResultSchema = z
  .object({
    eventId: z.uuid(),
    hasJoined: z.boolean(),
    capacity: fields.capacity,
    participantCount: z.number().int().min(0).max(100),
    availableSlots: z.number().int().min(0).max(100),
  })
  .refine(
    (value) =>
      value.availableSlots === value.capacity - value.participantCount &&
      (!value.hasJoined || value.participantCount > 0),
    'Invalid event attendance.',
  )

export type CreateEventInput = z.input<typeof createEventInputSchema>
export type UpdateEventInput = z.input<typeof updateEventInputSchema>
export type HostEventDetails = z.output<typeof hostEventDetailsSchema>
export type AttendanceResult = z.output<typeof attendanceResultSchema>

export type EventActionSession = {
  viewerId: string | null
  getAccessToken: () => Promise<string | null>
}
