import { Button } from '@/components/ui/button'
import { FormSelect } from '@/components/form-select'
import type { GameExperienceLevel, ProfileGameExperience } from '../types'

type ProfileGameRowProps = {
  game: ProfileGameExperience
  onChange: (experience: GameExperienceLevel) => void
  onRemove: () => void
}

export function ProfileGameRow({ game, onChange, onRemove }: ProfileGameRowProps) {
  return (
    <li className="space-y-4 rounded-lg border bg-background p-4">
      <p className="font-semibold [overflow-wrap:anywhere]">{game.gameName}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1 space-y-2">
          <label htmlFor={'experience-' + game.gameId} className="block text-sm font-medium">
            Experience for {game.gameName}
          </label>
          <FormSelect
            id={'experience-' + game.gameId}
            value={game.experience}
            onChange={(event) => onChange(event.target.value as GameExperienceLevel)}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="veteran">Veteran</option>
          </FormSelect>
        </div>
        <Button type="button" variant="ghost" aria-label={'Remove ' + game.gameName} onClick={onRemove}>
          Remove
        </Button>
      </div>
    </li>
  )
}
