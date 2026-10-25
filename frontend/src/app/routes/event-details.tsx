import { useParams } from 'react-router'

import { EventDetails } from '@/features/events/components/event-details'
import { GameSummary } from '@/features/games/components/game-summary'
import { useSession } from '@/features/users/api/use-session'
import { PublicUserSummary } from '@/features/users/components/public-user-summary'
import { useAuth } from '@/features/users/api/use-auth'
import { demoModeEnabled } from '@/features/users/api/auth-client'
import { Link } from 'react-router'

export function EventDetailsRoute() {
  const { eventId } = useParams()
  const session = useSession()
  const auth = useAuth()
  return (
    <>
      {auth.data && (
        <p role="status" className="mb-6 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          You are logged in with a real account. This event uses demo data, so hosting and attendance are
          unavailable for this account.{' '}
          <Link className="text-primary underline" to="/account">
            View account
          </Link>
        </p>
      )}
      <EventDetails
        eventId={eventId}
        currentUserId={session.data?.id ?? null}
        sessionPending={session.isPending || auth.isPending}
        sessionError={Boolean(session.error)}
        participationUnavailable={!demoModeEnabled || Boolean(auth.data)}
        renderHost={(userId) => <PublicUserSummary userId={userId} />}
        renderGame={(gameId) => <GameSummary gameId={gameId} />}
      />
    </>
  )
}
