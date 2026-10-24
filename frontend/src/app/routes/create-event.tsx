import { EventEditor } from '@/features/events/components/event-editor'
import { useGames } from '@/features/games/api/use-games'
import { useSession } from '@/features/users/api/use-session'
import { LocationPicker } from '@/features/geography/components/location-picker'

export function CreateEvent() {
  const session = useSession()
  const games = useGames()
  return (
    <EventEditor
      mode="create"
      currentUserId={session.data?.id ?? null}
      hostName={session.data?.displayName}
      games={games.data}
      gamesPending={games.isPending}
      gamesError={Boolean(games.error)}
      retryGames={() => void games.refetch()}
      renderLocation={(props) => <LocationPicker {...props} />}
    />
  )
}
