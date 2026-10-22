import { z } from 'zod'

import { mockReferences } from '@/lib/mock-db'

import type { Event, NewEvent } from '../types'

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
  city: z.string().trim().min(2, 'Enter a city with at least 2 characters.').max(80),
  venue: z.string().trim().min(2, 'Enter a venue or meeting point.').max(120),
  address: z.string().trim().min(3, 'Enter an address with at least 3 characters.').max(200),
  startsAt: z.iso.datetime({ offset: true, error: 'Choose a valid start date and time.' }),
  endsAt: z.iso.datetime({ offset: true, error: 'Choose a valid end date and time.' }),
  capacity: z
    .number({ error: 'Enter the number of player seats.' })
    .int('Use a whole number of seats.')
    .min(1, 'Provide at least one player seat.')
    .max(100, 'Use no more than 100 player seats.'),
  experienceLevel: z.enum(['all-levels', 'beginner', 'experienced']),
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
    ])
    .nullable(),
  tags: z
    .array(z.string().trim())
    .max(6, 'Use no more than 6 tags.')
    .refine((tags) => tags.every((tag) => tag.length >= 2), 'Each tag needs at least 2 characters.')
    .refine((tags) => tags.every((tag) => tag.length <= 30), 'Keep each tag to 30 characters.')
    .refine(
      (tags) => new Set(tags.map((tag) => tag.toLowerCase())).size === tags.length,
      'Tags must be unique.',
    ),
  minimumAge: z
    .number({ error: 'Enter a minimum age, or 0 for all ages.' })
    .int('Use a whole number for minimum age.')
    .min(0, 'Minimum age cannot be negative.')
    .max(99, 'Minimum age must be 99 or below.'),
  visibility: z.enum(['public', 'private', 'unlisted']),
})

export const newEventSchema = eventFields.superRefine((input, context) => {
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
  .extend({ status: z.enum(['scheduled', 'cancelled']) })
  .partial()
  .refine((input) => Object.values(input).some((field) => field !== undefined), 'Supply at least one field.')

export function editableEventValues(event: Event): NewEvent {
  return {
    title: event.title,
    description: event.description,
    gameId: event.gameId,
    city: event.city,
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
