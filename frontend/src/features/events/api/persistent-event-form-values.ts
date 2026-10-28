import { z } from 'zod'
import { locationReferenceSchema } from '@/lib/location'
import type { EventFormValues } from './event-form-values'
import { localDateTime, isoDateTime } from './event-date-time'
import { createEventInputSchema, eventContentInputSchema } from './event-write-dtos'
import type { CreateEventInput, HostEventDetails } from './event-write-dtos'

// Shared form controls describe editable values, never event/account identities.
const draftSchema = z.strictObject({
  title: createEventInputSchema.shape.title,
  description: createEventInputSchema.shape.description,
  gameId: createEventInputSchema.shape.gameId,
  city: z.string(),
  countryCode: z.string().optional(),
  location: locationReferenceSchema.nullable().optional(),
  venue: z.string().optional(),
  address: createEventInputSchema.shape.address,
  startsAt: z.string().min(1, 'Choose a start date and time.'),
  endsAt: z.string().min(1, 'Choose an end date and time.'),
  capacity: createEventInputSchema.shape.capacity,
  minimumAge: createEventInputSchema.shape.minimumAge.unwrap(),
  experienceLevel: createEventInputSchema.shape.experienceLevel,
  price: createEventInputSchema.shape.price.unwrap(),
  tags: createEventInputSchema.shape.tags.unwrap(),
  visibility: createEventInputSchema.shape.visibility.unwrap(),
  imageUrl: z.string().nullable(),
})

export function persistentEventFormSchema(event?: HostEventDetails) {
  const contentSchema = event
    ? eventContentInputSchema.superRefine((value, context) => {
        const experienceChanged = value.experienceLevel !== event.experienceLevel
        const tagsChanged = JSON.stringify(value.tags) !== JSON.stringify(event.tags)
        if (experienceChanged && ['beginner', 'experienced'].includes(value.experienceLevel))
          context.addIssue({
            code: 'custom',
            path: ['experienceLevel'],
            message: 'Choose a current recommended experience level.',
          })
        if (
          (experienceChanged || tagsChanged) &&
          value.tags.some((tag) => tag === 'Beginner friendly' || tag === 'Veterans only')
        )
          context.addIssue({
            code: 'custom',
            path: ['tags'],
            message: 'Remove legacy experience tags before changing tags or recommendations.',
          })
      })
    : createEventInputSchema
  return draftSchema
    .superRefine((draft, context) => {
      if (!draft.location)
        context.addIssue({
          code: 'custom',
          path: ['location'],
          message: 'Choose a city from the suggestions.',
        })
      if (!draft.countryCode)
        context.addIssue({ code: 'custom', path: ['countryCode'], message: 'Choose a country.' })
      if (
        draft.location &&
        (draft.countryCode !== draft.location.countryIsoCode || draft.city !== draft.location.cityName)
      )
        context.addIssue({
          code: 'custom',
          path: ['location'],
          message: 'Choose a city in the selected country.',
        })
      if (draft.imageUrl !== null)
        context.addIssue({
          code: 'custom',
          path: ['imageUrl'],
          message: 'Only the standard game illustration is available.',
        })
      if (event && draft.capacity < event.participantCount)
        context.addIssue({
          code: 'custom',
          path: ['capacity'],
          message: `Keep at least ${event.participantCount} seats for current participants.`,
        })
    })
    .transform((draft): z.input<typeof createEventInputSchema> => ({
      title: draft.title,
      description: draft.description,
      gameId: draft.gameId,
      cityId: draft.location?.cityId ?? 0,
      venue: draft.venue ?? '',
      address: draft.address,
      // Retain unchanged instants, including seconds and DST-overlap offsets. Only changed
      // local picker values are interpreted in the viewer's current timezone.
      startsAt:
        event && draft.startsAt === localDateTime(event.startsAt)
          ? event.startsAt
          : isoDateTime(draft.startsAt),
      endsAt:
        event && draft.endsAt === localDateTime(event.endsAt) ? event.endsAt : isoDateTime(draft.endsAt),
      capacity: draft.capacity,
      minimumAge: draft.minimumAge,
      experienceLevel: draft.experienceLevel,
      price: draft.price,
      tags: draft.tags,
      visibility: draft.visibility,
    }))
    .pipe(contentSchema) satisfies z.ZodType<CreateEventInput, EventFormValues>
}

export function persistentEventFormDefaults(event?: HostEventDetails): EventFormValues {
  return {
    title: event?.title ?? '',
    description: event?.description ?? '',
    gameId: event?.game.id ?? 0,
    city: event?.city.name ?? '',
    countryCode: event?.country.isoCode ?? 'ME',
    location: event
      ? {
          cityId: event.city.id,
          cityName: event.city.name,
          countryId: event.country.id,
          countryIsoCode: event.country.isoCode,
          countryName: event.country.name,
          administrativeDivision: event.city.administrativeDivision,
          admin1Code: null,
          admin2Code: null,
        }
      : null,
    venue: event?.venue ?? '',
    address: event?.address ?? '',
    startsAt: event ? localDateTime(event.startsAt) : '',
    endsAt: event ? localDateTime(event.endsAt) : '',
    capacity: event?.capacity ?? 6,
    minimumAge: event?.minimumAge ?? 0,
    experienceLevel: event?.experienceLevel ?? 'all-levels',
    price: event?.price ?? 0,
    tags: event?.tags ?? [],
    visibility: event?.visibility ?? 'public',
    imageUrl: null,
  }
}
