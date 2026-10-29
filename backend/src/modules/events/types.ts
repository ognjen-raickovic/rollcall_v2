import type { z } from 'zod'
import type {
  attendanceResultSchema,
  eventDiscoverySchema,
  eventSummarySchema,
  hostEventDetailsSchema,
  newEventSchema,
  participantEventDetailsSchema,
  publicEventDetailsSchema,
  updateEventSchema,
  viewerStatusSchema,
} from './event-schema.js'

export type EventSummary = z.infer<typeof eventSummarySchema>
export type PublicEventDetails = z.infer<typeof publicEventDetailsSchema>
export type HostEventDetails = z.infer<typeof hostEventDetailsSchema>
export type ParticipantEventDetails = z.infer<typeof participantEventDetailsSchema>
export type EventDetails = PublicEventDetails | HostEventDetails | ParticipantEventDetails
export type AttendanceResult = z.infer<typeof attendanceResultSchema>
export type NewEvent = z.infer<typeof newEventSchema>
export type UpdateEvent = z.infer<typeof updateEventSchema>
export type EventDiscoveryFilters = z.infer<typeof eventDiscoverySchema>
export type EventPage = { items: EventSummary[]; pageInfo: { limit: number; nextCursor: string | null } }

export interface EventRepository {
  viewerStatus(eventIds: string[], expectedUserId: string): Promise<z.infer<typeof viewerStatusSchema>>
  list(filters: EventDiscoveryFilters): Promise<EventPage>
  get(eventId: string, expectedUserId?: string): Promise<EventDetails>
  create(input: NewEvent, expectedHostId: string): Promise<HostEventDetails>
  update(eventId: string, patch: UpdateEvent, expectedHostId: string): Promise<HostEventDetails>
  remove(eventId: string): Promise<void>
  join(eventId: string): Promise<AttendanceResult>
  leave(eventId: string): Promise<AttendanceResult>
}
