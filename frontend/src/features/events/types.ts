export type EventStatus = 'scheduled' | 'cancelled'
export type ExperienceLevel = 'all-levels' | 'beginner' | 'experienced'
export type EventVisibility = 'public' | 'unlisted'

export type Event = {
  id: number
  title: string
  description: string
  gameId: number
  organizerId: number
  city: string
  venue: string
  address: string
  startsAt: string
  endsAt: string
  capacity: number
  attendeeIds: number[]
  experienceLevel: ExperienceLevel
  price: number
  imageUrl: string | null
  tags: string[]
  minimumAge: number
  visibility: EventVisibility
  status: EventStatus
  createdAt: string
  updatedAt: string
}

export type NewEvent = Omit<
  Event,
  'id' | 'organizerId' | 'attendeeIds' | 'status' | 'createdAt' | 'updatedAt'
>
export type UpdateEvent = Partial<NewEvent & { status: EventStatus }>

export type EventFilters = {
  search?: string
  city?: string
  gameId?: number
  startsAfter?: string
  startsBefore?: string
  availableOnly?: boolean
  status?: EventStatus
  visibility?: EventVisibility
  upcomingOnly?: boolean
}
