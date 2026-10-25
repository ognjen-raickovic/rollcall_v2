import { useParams } from 'react-router'

import { EventDetails } from '@/features/events/components/event-details'
import { useApiSession } from '@/features/users/api/use-auth'

export function EventDetailsRoute() {
  const { eventId } = useParams()
  const session = useApiSession()
  return (
    <EventDetails
      key={`${eventId ?? 'invalid'}-${session.viewerId ?? 'guest'}`}
      eventId={eventId}
      viewerId={session.viewerId}
      getAccessToken={session.getAccessToken}
      sessionReady={session.ready}
      sessionError={session.error}
    />
  )
}
