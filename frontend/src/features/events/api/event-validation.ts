import { z } from 'zod'

import { mockReferences } from '@/lib/mock-db'
import { locationReferenceSchema } from '@/lib/location'

import type { Event, NewEvent } from '../types'
import { EVENT_TAGS, tagMatchesExperience, tagConflict } from '../event-tags'
import { validEventImageDataUrl } from './event-covers'

const venueSchema = z
  .string()
  .trim()
  .max(120)
  .refine(
    (value) => value === '' || value.length >= 2,
    'Enter at least 2 characters, or leave the venue blank.',
  )

export const eventFields = z.strictObject({
  title: z
    .string()
    .trim()
    .min(3, 'Enter a title with at least 3 characters.')
    .max(100, 'Keep the title to 100 characters.'),
  description: z
    .string()
    .trim()
    .min(10, 'Describe your event in at least 10 characters.')
    .max(5000, 'Keep the description to 5000 characters.'),
  gameId: z
    .number({ error: 'Choose a game.' })
    .int()
    .positive('Choose a game.')
    .max(Number.MAX_SAFE_INTEGER)
    .refine((id) => mockReferences.gameIds.has(id), 'Choose an existing game.'),
  city: z.string().trim().min(1, 'Choose a city.').max(200),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/, 'Choose a country.')
    .optional(),
  location: locationReferenceSchema.nullable().optional(),
  venue: venueSchema.default(''),
  address: z.string().trim().min(3, 'Enter an address with at least 3 characters.').max(200),
  startsAt: z.iso.datetime({ offset: true, error: 'Choose a valid start date and time.' }),
  endsAt: z.iso.datetime({ offset: true, error: 'Choose a valid end date and time.' }),
  capacity: z
    .number({ error: 'Enter the number of player seats.' })
    .int('Use a whole number of seats.')
    .min(1, 'Provide at least one player seat.')
    .max(100, 'Use no more than 100 player seats.'),
  experienceLevel: z.enum([
    'all-levels',
    'beginner',
    'experienced',
    'intermediate-plus',
    'veteran-plus',
  ]),
  price: z
    .number({ error: 'Enter a price, or 0 for a free event.' })
    .min(0, 'Price cannot be negative.')
    .max(10000)
    .multipleOf(0.01, 'Use no more than two decimal places.'),
  imageUrl: z
    .union([
      z.url({ protocol: /^https?$/ }).max(2000),
      z
        .string()
        .max(2000)
        .regex(/^\/images\/[a-z0-9-]+\.(svg|webp|png|jpg)$/),
      z
        .string()
        .refine(validEventImageDataUrl, 'Choose a valid JPG, PNG, or WebP cover of 3 MB or less.'),
    ])
    .nullable(),
  tags: z
    .array(z.enum(EVENT_TAGS, { error: 'Choose tags from the predefined list.' }))
    .max(6, 'Use no more than 6 tags.')
    .refine(
      (tags) => new Set(tags.map((tag) => tag.toLowerCase())).size === tags.length,
      'Tags must be unique.',
    )
    .refine(
      (tags) => !(tags.includes('Beginner friendly') && tags.includes('Veterans only')),
      'Beginner friendly and Veterans only cannot be selected together.',
    ),
  minimumAge: z
    .number({ error: 'Enter a minimum age, or 0 for all ages.' })
    .int('Use a whole number for minimum age.')
    .min(0, 'Minimum age cannot be negative.')
    .max(99, 'Minimum age must be 99 or below.'),
  visibility: z.enum(['public', 'private', 'unlisted']),
})

export const newEventSchema = eventFields.superRefine((input, context) => {
  if (input.location && input.city !== input.location.cityName)
    context.addIssue({
      code: 'custom',
      path: ['city'],
      message: 'The city must match the selected location.',
    })
  if (input.location && input.countryCode && input.countryCode !== input.location.countryIsoCode)
    context.addIssue({
      code: 'custom',
      path: ['countryCode'],
      message: 'The country must match the selected city.',
    })
  if (tagConflict(input.tags))
    context.addIssue({
      code: 'custom',
      path: ['tags'],
      message: tagConflict(input.tags) ?? 'Choose compatible tags.',
    })
  if (input.tags.some((tag) => !tagMatchesExperience(tag, input.experienceLevel)))
    context.addIssue({
      code: 'custom',
      path: ['tags'],
      message:
        'Choose tags that match the experience level. Veterans only requires Experienced players.',
    })
  if (Date.parse(input.startsAt) <= Date.now())
    context.addIssue({
      code: 'custom',
      path: ['startsAt'],
      message: 'Choose a start date and time in the future.',
    })
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt))
    context.addIssue({ code: 'custom', path: ['endsAt'], message: 'The end must be after the start.' })
})

export const updateEventSchema = eventFields
  .extend({ status: z.enum(['scheduled', 'cancelled']), venue: venueSchema })
  .partial()
  .refine(
    (input) => Object.values(input).some((field) => field !== undefined),
    'Supply at least one field.',
  )

export function editableEventValues(event: Event): NewEvent {
  return {
    title: event.title,
    description: event.description,
    gameId: event.gameId,
    city: event.city,
    countryCode: event.countryCode,
    location: event.location,
    venue: event.venue,
    address: event.address,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    capacity: event.capacity,
    experienceLevel: event.experienceLevel,
    price: event.price,
    imageUrl: event.imageUrl,
    tags: event.tags,
    minimumAge: event.minimumAge,
    visibility: event.visibility,
  }
}
