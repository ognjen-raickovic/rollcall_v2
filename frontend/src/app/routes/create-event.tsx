import { PersistentEventEditor } from '@/features/events/components/persistent-event-editor'
import { useCatalogGames } from '@/features/games/api/use-catalog'
import { useApiSession } from '@/features/users/api/use-auth'
import { LocationPicker } from '@/features/geography/components/location-picker'

export function CreateEvent() {
  const session = useApiSession()
  const games = useCatalogGames()
  return (
    <PersistentEventEditor
      mode="create"
      session={session}
      games={games.data}
      gamesPending={games.isPending}
      gamesError={Boolean(games.error)}
      retryGames={() => void games.refetch()}
      renderLocation={(props) => <LocationPicker {...props} />}
    />
  )
}
