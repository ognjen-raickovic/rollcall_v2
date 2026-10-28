import type { EventTag } from './event-tags'
import type { LocationReference } from '@/lib/location'

export type EventStatus = 'scheduled' | 'cancelled'
export type ExperienceLevel =
  'all-levels' | 'beginner' | 'experienced' | 'intermediate-plus' | 'veteran-plus'
export type EventVisibility = 'public' | 'private' | 'unlisted'

export type Event = {
  id: number
  title: string
  description: string
  gameId: number
  organizerId: number
  city: string
  countryCode?: string
  location?: LocationReference | null
  venue: string
  address: string
  startsAt: string
  endsAt: string
  capacity: number
  attendeeIds: number[]
  experienceLevel: ExperienceLevel
  price: number
  imageUrl: string | null
  tags: EventTag[]
  minimumAge: number
  visibility: EventVisibility
  status: EventStatus
  createdAt: string
  updatedAt: string
}

export type NewEvent = Omit<
  Event,
  'id' | 'organizerId' | 'attendeeIds' | 'status' | 'createdAt' | 'updatedAt' | 'venue'
> & { venue?: string }
export type UpdateEvent = Partial<NewEvent & { status: EventStatus }>

export type EventFilters = {
  search?: string
  city?: string
  country?: string
  cityId?: number
  gameId?: number
  startsAfter?: string
  startsBefore?: string
  availableOnly?: boolean
  status?: EventStatus
  visibility?: Exclude<EventVisibility, 'private'>
  upcomingOnly?: boolean
}
