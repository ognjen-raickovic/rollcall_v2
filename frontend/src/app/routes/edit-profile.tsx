import { useCatalogGames } from '@/features/games/api/use-catalog'
import { ProfileLocationPicker } from '@/features/geography/components/profile-location-picker'
import { ProfileEditor } from '@/features/users/components/profile-editor'

export function EditProfile() {
  const games = useCatalogGames()
  return (
    <ProfileEditor
      games={games.data}
      gamesPending={games.isPending}
      gamesError={Boolean(games.error)}
      retryGames={() => void games.refetch()}
      renderLocation={(props) => <ProfileLocationPicker {...props} />}
    />
  )
}
