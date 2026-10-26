import { z } from 'zod'
import { eventCursorSchema } from './event-pagination.js'
import { EVENT_TAGS, tagsMatchExperience } from './event-tags.js'
import { eventCoverSchema } from './event-cover-schema.js'

const id = z.number().int().min(1).max(2147483647)
const instant = z.iso.datetime({ offset: true })
const visibility = z.enum(['public', 'unlisted', 'private'])
const status = z.enum(['scheduled', 'cancelled'])
const experience = z.enum(['all-levels', 'beginner', 'experienced'])
const category = z.enum(['role-playing', 'trading-card', 'board-game', 'social-deduction'])
const price = z.number().min(0).max(10000).multipleOf(0.01)
const tags = z
  .array(z.enum(EVENT_TAGS))
  .max(6)
  .refine((value) => new Set(value).size === value.length, 'Tags must be unique.')
  .refine(
    (value) => !(value.includes('Beginner friendly') && value.includes('Veterans only')),
    'Beginner friendly and Veterans only cannot be combined.',
  )
const venue = z
  .string()
  .trim()
  .max(120)
  .refine((value) => value === '' || value.length >= 2, 'Use at least 2 characters or leave venue blank.')
  .transform((value) => value || null)
  .nullable()

const writableFields = {
  title: z.string().trim().min(3, 'Use at least 3 characters.').max(100, 'Use at most 100 characters.'),
  description: z.string().trim().min(10, 'Use at least 10 characters.').max(5000),
  gameId: id,
  cityId: id,
  venue,
  address: z.string().trim().min(3, 'Use at least 3 characters.').max(200),
  startsAt: instant,
  endsAt: instant,
  capacity: z.number().int().min(1).max(100),
  minimumAge: z.number().int().min(0).max(99),
  experienceLevel: experience,
  price,
  tags,
  visibility,
  // Only the dedicated validated cover API may change the stored object association.
  coverStoragePath: z.null(),
}

function checkEditableValues(
  value: {
    startsAt?: string
    endsAt?: string
    tags?: readonly string[]
    experienceLevel?: string
  },
  context: z.RefinementCtx,
): void {
  if (value.startsAt !== undefined && Date.parse(value.startsAt) <= Date.now())
    context.addIssue({
      code: 'custom',
      path: ['startsAt'],
      message: 'Choose a future start time.',
    })
  if (
    value.startsAt !== undefined &&
    value.endsAt !== undefined &&
    Date.parse(value.endsAt) <= Date.parse(value.startsAt)
  )
    context.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: 'End time must be after the start.',
    })
  if (
    value.tags !== undefined &&
    value.experienceLevel !== undefined &&
    !tagsMatchExperience(value.tags, value.experienceLevel)
  )
    context.addIssue({
      code: 'custom',
      path: ['tags'],
      message: 'Choose tags compatible with experience.',
    })
}

export const newEventSchema = z
  .strictObject({
    ...writableFields,
    venue: venue.default(null),
    minimumAge: writableFields.minimumAge.default(0),
    price: price.default(0),
    tags: tags.default([]),
    visibility: visibility.default('public'),
    coverStoragePath: writableFields.coverStoragePath.default(null),
  })
  .superRefine(checkEditableValues)

// No defaults in a patch: omitting a value must preserve its stored value.
export const updateEventSchema = z
  .strictObject({ ...writableFields, status })
  .partial()
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), 'Supply at least one field.')
  .superRefine(checkEditableValues)

const queryId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(id)
const queryBoolean = z.enum(['true', 'false']).transform((value) => value === 'true')
export const eventDiscoverySchema = z
  .strictObject({
    search: z.string().trim().max(100).optional(),
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase())
      .optional(),
    cityId: queryId.optional(),
    gameId: queryId.optional(),
    startsAfter: instant.optional(),
    startsBefore: instant.optional(),
    upcomingOnly: queryBoolean.default(true),
    availableOnly: queryBoolean.default(false),
    status: z.literal('scheduled').default('scheduled'),
    limit: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(50))
      .default(12),
    cursor: eventCursorSchema.optional(),
  })
  .refine(
    (value) =>
      !value.startsAfter ||
      !value.startsBefore ||
      Date.parse(value.startsAfter) <= Date.parse(value.startsBefore),
    {
      path: ['startsBefore'],
      message: 'End of the date range must not precede its start.',
    },
  )
  .transform(({ cursor, ...filters }) => ({
    ...filters,
    ...(cursor ? { afterStartsAt: cursor.startsAt, afterId: cursor.id } : {}),
  }))

export const eventIdSchema = z.strictObject({ eventId: z.uuid() })
export const noQuerySchema = z.strictObject({})
export const attendanceBodySchema = z.strictObject({}).optional()

const summaryFields = {
  id: z.uuid(),
  title: z.string().min(3).max(100),
  game: z.object({ id, name: z.string().min(2).max(100), category }),
  city: z.object({
    id,
    name: z.string().min(1).max(200),
    administrativeDivision: z.string().nullable(),
  }),
  country: z.object({
    id,
    isoCode: z.string().regex(/^[A-Z]{2}$/),
    name: z.string(),
  }),
  venue: z.string().min(2).max(120).nullable(),
  startsAt: instant,
  endsAt: instant,
  capacity: z.number().int().min(1).max(100),
  participantCount: z.number().int().min(0).max(100),
  availableSlots: z.number().int().min(0).max(100),
  tags,
  visibility,
  status,
  cover: eventCoverSchema,
}

function checkSummary(
  value: {
    startsAt: string
    endsAt: string
    capacity: number
    participantCount: number
    availableSlots: number
  },
  context: z.RefinementCtx,
): void {
  if (value.availableSlots !== value.capacity - value.participantCount)
    context.addIssue({
      code: 'custom',
      path: ['availableSlots'],
      message: 'Invalid event availability.',
    })
  if (Date.parse(value.endsAt) <= Date.parse(value.startsAt))
    context.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: 'Invalid event schedule.',
    })
}

export const eventSummarySchema = z.object(summaryFields).superRefine(checkSummary)
export const discoverySummarySchema = z
  .object({
    ...summaryFields,
    visibility: z.literal('public'),
    status: z.literal('scheduled'),
  })
  .superRefine(checkSummary)
const detailFields = {
  ...summaryFields,
  description: z.string().min(10).max(5000),
  host: z.object({ id: z.uuid(), displayName: z.string().min(2).max(80) }),
  minimumAge: writableFields.minimumAge,
  experienceLevel: experience,
  price,
  currency: z.literal('EUR'),
  createdAt: instant,
  updatedAt: instant,
}
const publicViewer = z.object({
  userId: z.uuid().nullable(),
  isHost: z.literal(false),
  hasJoined: z.literal(false),
})
export const databaseEventDetailsSchema = z
  .object({
    ...detailFields,
    viewer: z.object({
      userId: z.uuid().nullable(),
      isHost: z.boolean(),
      hasJoined: z.boolean(),
    }),
  })
  .superRefine(checkSummary)
export const publicEventDetailsSchema = z
  .object({ ...detailFields, viewer: publicViewer })
  .superRefine(checkSummary)
export const hostEventDetailsSchema = z
  .object({
    ...detailFields,
    viewer: z.object({
      userId: z.uuid(),
      isHost: z.literal(true),
      hasJoined: z.literal(false),
    }),
    address: z.string().min(3).max(200),
  })
  .superRefine(checkSummary)
export const participantEventDetailsSchema = z
  .object({
    ...detailFields,
    viewer: z.object({
      userId: z.uuid(),
      isHost: z.literal(false),
      hasJoined: z.literal(true),
    }),
    address: z.string().min(3).max(200),
  })
  .superRefine(checkSummary)
  .refine((value) => value.participantCount > 0, 'A joined viewer must have a participant seat.')
export const attendanceResultSchema = z
  .object({
    eventId: z.uuid(),
    hasJoined: z.boolean(),
    capacity: writableFields.capacity,
    participantCount: summaryFields.participantCount,
    availableSlots: summaryFields.availableSlots,
  })
  .refine(
    (value) =>
      value.availableSlots === value.capacity - value.participantCount &&
      (!value.hasJoined || value.participantCount > 0),
    'Invalid event attendance.',
  )
export const databaseEventPageSchema = z.object({
  items: z.array(discoverySummarySchema).max(50),
  hasMore: z.boolean(),
})
