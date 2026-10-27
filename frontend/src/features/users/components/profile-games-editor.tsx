import { Button } from '@/components/ui/button'
import { useProfileExperience } from '../api/use-profiles'
import { ProfileGamesDraft } from './profile-games-draft'
export type ProfileGamesEditorProps = {
  games?: { id: number; name: string }[]
  gamesPending: boolean
  gamesError: boolean
  retryGames: () => void
}

export function ProfileGamesEditor(props: ProfileGamesEditorProps) {
  const experience = useProfileExperience()
  if (experience.isPending) return <p role="status">Loading your games...</p>
  if (!experience.data)
    return (
      <div className="space-y-3">
        <p role="alert">{experience.error?.message ?? 'Your games could not be loaded.'}</p>
        <Button onClick={() => void experience.refetch()}>Retry your games</Button>
      </div>
    )
  return (
    <ProfileGamesDraft
      {...props}
      saved={experience.data}
      reload={async () => {
        const result = await experience.refetch()
        if (result.error || !result.data)
          throw new Error('Saved games could not be reloaded. Your draft is unchanged.')
        return result.data
      }}
    />
  )
}
