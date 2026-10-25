import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useRemoveProfileExperience, useSetProfileExperience } from '../api/use-profiles'
import type { GameExperienceLevel, ProfileGameExperience } from '../types'

type ProfileGameRowProps = { game: ProfileGameExperience; onRemoved: () => void }

export function ProfileGameRow({ game, onRemoved }: ProfileGameRowProps) {
  const [level, setLevel] = useState<GameExperienceLevel>(game.experience)
  const update = useSetProfileExperience()
  const remove = useRemoveProfileExperience()
  return (
    <li className="space-y-4 rounded-lg border bg-background p-4">
      <p className="font-semibold [overflow-wrap:anywhere]">{game.gameName}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1 space-y-2">
          <label htmlFor={`experience-${game.gameId}`} className="block text-sm font-medium">
            Experience for {game.gameName}
          </label>
          <select
            id={`experience-${game.gameId}`}
            value={level}
            onChange={(event) => {
              setLevel(event.target.value as GameExperienceLevel)
              update.reset()
            }}
            disabled={update.isPending || remove.isPending}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="veteran">Veteran</option>
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={level === game.experience || update.isPending || remove.isPending}
          aria-label={`Save experience for ${game.gameName}`}
          onClick={() => update.mutate({ gameId: game.gameId, experience: level })}
        >
          {update.isPending ? 'Saving...' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={remove.isPending || update.isPending}
          aria-label={`Remove ${game.gameName}`}
          onClick={() => remove.mutate(game.gameId, { onSuccess: onRemoved })}
        >
          {remove.isPending ? 'Removing...' : 'Remove'}
        </Button>
      </div>
      {update.isSuccess && (
        <p role="status" className="text-sm text-primary">
          Experience updated.
        </p>
      )}
      {(update.error || remove.error) && (
        <p role="alert" className="text-sm text-destructive">
          {update.error?.message ?? remove.error?.message}
        </p>
      )}
    </li>
  )
}
