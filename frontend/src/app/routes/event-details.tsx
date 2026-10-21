import { useParams } from 'react-router'

import { EventDetails } from '@/features/events/components/event-details'
import { useSession } from '@/features/users/api/use-session'

export function EventDetailsRoute() {
  const { eventId } = useParams()
  const session = useSession()
  return (
    <EventDetails
      eventId={eventId}
      currentUserId={session.data?.id ?? null}
      sessionPending={session.isPending}
      sessionError={Boolean(session.error)}
    />
  )
}
