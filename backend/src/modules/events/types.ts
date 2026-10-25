import type { z } from 'zod'
import type {
  eventDiscoverySchema,
  eventSummarySchema,
  hostEventDetailsSchema,
  newEventSchema,
  publicEventDetailsSchema,
  updateEventSchema,
} from './event-schema.js'

export type EventSummary = z.infer<typeof eventSummarySchema>
export type PublicEventDetails = z.infer<typeof publicEventDetailsSchema>
export type HostEventDetails = z.infer<typeof hostEventDetailsSchema>
export type NewEvent = z.infer<typeof newEventSchema>
export type UpdateEvent = z.infer<typeof updateEventSchema>
export type EventDiscoveryFilters = z.infer<typeof eventDiscoverySchema>
export type EventPage = { items: EventSummary[]; pageInfo: { limit: number; nextCursor: string | null } }

export interface EventRepository {
  list(filters: EventDiscoveryFilters): Promise<EventPage>
  get(eventId: string, expectedHostId?: string): Promise<PublicEventDetails | HostEventDetails>
  create(input: NewEvent, expectedHostId: string): Promise<HostEventDetails>
  update(eventId: string, patch: UpdateEvent, expectedHostId: string): Promise<HostEventDetails>
  remove(eventId: string): Promise<void>
}
