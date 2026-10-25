import { useState } from 'react'
import { Gamepad2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useProfileExperience, useSetProfileExperience } from '../api/use-profiles'
import type { GameExperienceLevel } from '../types'
import { ProfileGameRow } from './profile-game-row'

export type ProfileGamesEditorProps = {
  games?: { id: number; name: string }[]
  gamesPending: boolean
  gamesError: boolean
  retryGames: () => void
}

export function ProfileGamesEditor({ games, gamesPending, gamesError, retryGames }: ProfileGamesEditorProps) {
  const experience = useProfileExperience()
  const add = useSetProfileExperience()
  const [gameId, setGameId] = useState('')
  const [level, setLevel] = useState<GameExperienceLevel>('beginner')
  const [removed, setRemoved] = useState(false)
  const available =
    games?.filter((game) => !experience.data?.some((selected) => selected.gameId === game.id)) ?? []
  const selectedId = available.some((game) => String(game.id) === gameId) ? gameId : ''
  return (
    <section className="space-y-6 rounded-xl border bg-card p-6 md:p-8" aria-labelledby="my-games-title">
      <div className="space-y-2">
        <h2 id="my-games-title" className="flex items-center gap-2 text-xl font-semibold">
          <Gamepad2 className="size-5 text-primary" aria-hidden="true" />
          My games
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Choose your experience for each game independently. It is self-declared, not verified. Game changes
          save immediately.
        </p>
      </div>
      {experience.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading your games...
        </p>
      ) : experience.error ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {experience.error.message}
          </p>
          <Button type="button" variant="outline" onClick={() => void experience.refetch()}>
            Retry your games
          </Button>
        </div>
      ) : (
        <>
          {experience.data?.length ? (
            <ul className="space-y-4">
              {experience.data.map((game) => (
                <ProfileGameRow key={game.gameId} game={game} onRemoved={() => setRemoved(true)} />
              ))}
            </ul>
          ) : (
            <p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No games added yet. Add a favorite to help other players get to know your table.
            </p>
          )}
          {gamesPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading the game catalog...
            </p>
          ) : gamesError ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">
                The game catalog couldn’t be loaded.
              </p>
              <Button type="button" variant="outline" onClick={retryGames}>
                Retry game catalog
              </Button>
            </div>
          ) : !games?.length ? (
            <p role="status" className="text-sm text-muted-foreground">
              No games are available in the catalog yet.
            </p>
          ) : !available.length ? (
            <p role="status" className="text-sm text-muted-foreground">
              You’ve added every game in the current catalog.
            </p>
          ) : (
            <form
              className="space-y-4 border-t pt-6"
              onSubmit={(event) => {
                event.preventDefault()
                if (selectedId)
                  add.mutate(
                    { gameId: Number(selectedId), experience: level },
                    { onSuccess: () => setGameId('') },
                  )
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-game">Game</Label>
                  <select
                    id="profile-game"
                    value={selectedId}
                    required
                    disabled={add.isPending}
                    onChange={(event) => {
                      setGameId(event.target.value)
                      add.reset()
                    }}
                    className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Choose a game</option>
                    {available.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-experience">Experience</Label>
                  <select
                    id="profile-experience"
                    value={level}
                    disabled={add.isPending}
                    onChange={(event) => setLevel(event.target.value as GameExperienceLevel)}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="veteran">Veteran</option>
                  </select>
                </div>
              </div>
              <Button type="submit" variant="outline" disabled={!selectedId || add.isPending}>
                <Plus aria-hidden="true" />
                {add.isPending ? 'Adding game...' : 'Add game'}
              </Button>
            </form>
          )}
          {add.isSuccess && (
            <p role="status" className="text-sm text-primary">
              Game added to your profile.
            </p>
          )}
          {add.error && (
            <p role="alert" className="text-sm text-destructive">
              {add.error.message}
            </p>
          )}
        </>
      )}
      {removed && (
        <p role="status" className="text-sm text-primary">
          Game removed from your profile.
        </p>
      )}
    </section>
  )
}
