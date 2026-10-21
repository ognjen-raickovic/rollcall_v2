import { useParams } from 'react-router'

import { EventDetails } from '@/features/events/components/event-details'

export function EventDetailsRoute() {
  const { eventId } = useParams()
  return <EventDetails eventId={eventId} />
}
