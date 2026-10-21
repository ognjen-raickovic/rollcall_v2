import { useParams } from 'react-router'

import { EventDetails } from '@/features/events/components/event-details'
import { GameSummary } from '@/features/games/components/game-summary'
import { useSession } from '@/features/users/api/use-session'
import { PublicUserSummary } from '@/features/users/components/public-user-summary'

export function EventDetailsRoute() {
  const { eventId } = useParams()
  const session = useSession()
  return (
    <EventDetails
      eventId={eventId}
      currentUserId={session.data?.id ?? null}
      sessionPending={session.isPending}
      sessionError={Boolean(session.error)}
      renderHost={(userId) => <PublicUserSummary userId={userId} />}
      renderGame={(gameId) => <GameSummary gameId={gameId} />}
    />
  )
}
