import { z } from 'zod'

import type { Event, NewEvent } from '../types'
import { editableEventValues, eventFields, newEventSchema } from './event-validation'

export function localDateTime(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const twoDigits = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}T${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
}

export function isoDateTime(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return ''
  const date = new Date(local)
  // Reject impossible dates and local times skipped by daylight-saving transitions.
  return Number.isFinite(date.getTime()) && localDateTime(date.toISOString()) === local
    ? date.toISOString()
    : ''
}

export const eventFormSchema = eventFields
  .extend({
    startsAt: z.string().min(1, 'Choose a start date and time.').transform(isoDateTime),
    endsAt: z.string().min(1, 'Choose an end date and time.').transform(isoDateTime),
    tags: z.string().transform((value) => (value.trim() ? value.split(',').map((tag) => tag.trim()) : [])),
  })
  .pipe(newEventSchema)

export type EventFormValues = z.input<typeof eventFormSchema>

export function eventFormDefaults(event?: Event): EventFormValues {
  const values: NewEvent = event
    ? editableEventValues(event)
    : {
        title: '',
        description: '',
        gameId: 0,
        city: '',
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
    startsAt: localDateTime(values.startsAt),
    endsAt: localDateTime(values.endsAt),
    tags: values.tags.join(', '),
  }
}

export function eventCover(category: string | undefined): string {
  const covers: Record<string, string> = {
    'role-playing': '/images/role-playing.svg',
    'trading-card': '/images/trading-card.svg',
    'board-game': '/images/board-games.svg',
    'social-deduction': '/images/social-deduction.svg',
  }
  return covers[category ?? ''] ?? '/images/board-games.svg'
}
