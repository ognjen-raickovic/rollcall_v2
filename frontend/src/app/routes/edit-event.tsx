import { useParams } from 'react-router'

import { PersistentEventEditor } from '@/features/events/components/persistent-event-editor'
import { useCatalogGames } from '@/features/games/api/use-catalog'
import { useApiSession } from '@/features/users/api/use-auth'
import { LocationPicker } from '@/features/geography/components/location-picker'

export function EditEvent() {
  const { eventId } = useParams()
  const session = useApiSession()
  const games = useCatalogGames()
  return (
    <PersistentEventEditor
      mode="edit"
      eventId={eventId}
      session={session}
      games={games.data}
      gamesPending={games.isPending}
      gamesError={Boolean(games.error)}
      retryGames={() => void games.refetch()}
      renderLocation={(props) => <LocationPicker {...props} />}
    />
  )
}
