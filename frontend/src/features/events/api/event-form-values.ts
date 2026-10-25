import { z } from 'zod'

import type { Event, NewEvent } from '../types'
import { editableEventValues, eventFields, newEventSchema } from './event-validation'
import { customEventCover } from './event-covers'

import { localDateTime, isoDateTime } from './event-date-time'
export { localDateTime, isoDateTime } from './event-date-time'

export const eventFormSchema = eventFields
  .extend({
    venue: z.string().optional(),
    startsAt: z.string().min(1, 'Choose a start date and time.').transform(isoDateTime),
    endsAt: z.string().min(1, 'Choose an end date and time.').transform(isoDateTime),
  })
  .pipe(newEventSchema)
  .superRefine((values, context) => {
    if (!values.location)
      context.addIssue({ code: 'custom', path: ['location'], message: 'Choose a city from the suggestions.' })
    if (!values.countryCode)
      context.addIssue({ code: 'custom', path: ['countryCode'], message: 'Choose a country.' })
  })

export type EventFormValues = z.input<typeof eventFormSchema>

export function eventFormDefaults(event?: Event): EventFormValues {
  const values: NewEvent = event
    ? editableEventValues(event)
    : {
        title: '',
        description: '',
        gameId: 0,
        city: '',
        countryCode: 'ME',
        location: null,
        venue: '',
        address: '',
        startsAt: '',
        endsAt: '',
        capacity: 6,
        minimumAge: 0,
        tags: [],
        visibility: 'public',
        experienceLevel: 'all-levels',
        price: 0,
        imageUrl: null,
      }
  return {
    ...values,
    countryCode: event?.location?.countryIsoCode ?? event?.countryCode ?? 'ME',
    location: event?.location ?? null,
    startsAt: localDateTime(values.startsAt),
    endsAt: localDateTime(values.endsAt),
    imageUrl: customEventCover(values.imageUrl),
  }
}
