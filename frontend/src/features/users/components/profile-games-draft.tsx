import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Gamepad2, Plus, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormSelect } from '@/components/form-select'
import { Label } from '@/components/ui/label'
import { HttpError } from '@/lib/http-client'
import { useReplaceProfileExperience } from '../api/use-profiles'
import type { GameExperienceLevel, ProfileGameExperience } from '../types'
import type { ProfileGamesEditorProps } from './profile-games-editor'
import { ProfileGameRow } from './profile-game-row'

type ProfileGamesDraftProps = ProfileGamesEditorProps & {
  saved: ProfileGameExperience[]
  reload: () => Promise<ProfileGameExperience[]>
}

export function ProfileGamesDraft({
  games,
  gamesPending,
  gamesError,
  retryGames,
  saved,
  reload,
}: ProfileGamesDraftProps) {
  const [baseline, setBaseline] = useState(saved)
  const [draft, setDraft] = useState(saved)
  const [gameId, setGameId] = useState('')
  const [level, setLevel] = useState<GameExperienceLevel>('beginner')
  const [reloadError, setReloadError] = useState('')
  const [reloading, setReloading] = useState(false)
  const save = useReplaceProfileExperience()
  const navigate = useNavigate()
  const entries = (items: ProfileGameExperience[]) =>
    items.map(({ gameId, experience }) => ({ gameId, experience })).sort((a, b) => a.gameId - b.gameId)
  const dirty = JSON.stringify(entries(draft)) !== JSON.stringify(entries(baseline))
  const available = games?.filter((game) => !draft.some((selected) => selected.gameId === game.id)) ?? []
  const busy = save.isPending || reloading
  return (
    <form
      className="space-y-6 rounded-xl border bg-card p-6 md:p-8"
      onSubmit={(event) => {
        event.preventDefault()
        if (!dirty || busy) return
        save.mutate(
          { games: entries(draft), expected: entries(baseline) },
          {
            onSuccess: () => {
              void navigate('/profile', { state: { profileSaved: true, gamesSaved: true } })
            },
          },
        )
      }}
    >
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Gamepad2 className="size-5 text-primary" aria-hidden="true" />
          My games
        </h2>
        <p className="text-sm text-muted-foreground">
          Experience is self-declared. Changes stay in this draft until you save.
        </p>
      </div>
      <fieldset disabled={busy} className="min-w-0 space-y-6">
        {draft.length ? (
          <ul className="space-y-4">
            {draft.map((game) => (
              <ProfileGameRow
                key={game.gameId}
                game={game}
                onChange={(experience) => {
                  setDraft((items) =>
                    items.map((item) => (item.gameId === game.gameId ? { ...item, experience } : item)),
                  )
                  save.reset()
                }}
                onRemove={() => {
                  setDraft((items) => items.filter((item) => item.gameId !== game.gameId))
                  save.reset()
                }}
              />
            ))}
          </ul>
        ) : (
          <p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No games added yet. Add a favorite to your draft.
          </p>
        )}
        {gamesPending ? (
          <p role="status">Loading the game catalog...</p>
        ) : gamesError ? (
          <div className="space-y-3">
            <p role="alert">The game catalog couldn't be loaded.</p>
            <Button type="button" variant="outline" onClick={retryGames}>
              Retry game catalog
            </Button>
          </div>
        ) : !games?.length ? (
          <p role="status">No games are available in the catalog yet.</p>
        ) : !available.length ? (
          <p role="status">You've added every game in the catalog.</p>
        ) : (
          <div className="space-y-4 border-t pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-game">Game</Label>
                <FormSelect
                  id="profile-game"
                  value={gameId}
                  onChange={(event) => setGameId(event.target.value)}
                >
                  <option value="">Choose a game</option>
                  {available.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.name}
                    </option>
                  ))}
                </FormSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-experience">Experience</Label>
                <FormSelect
                  id="profile-experience"
                  value={level}
                  onChange={(event) => setLevel(event.target.value as GameExperienceLevel)}
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="veteran">Veteran</option>
                </FormSelect>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!gameId || draft.length >= 50}
              onClick={() => {
                const game = available.find((item) => String(item.id) === gameId)
                if (!game) return
                setDraft((items) =>
                  items.some((item) => item.gameId === game.id)
                    ? items
                    : [...items, { gameId: game.id, gameName: game.name, experience: level }],
                )
                setGameId('')
                save.reset()
              }}
            >
              <Plus aria-hidden="true" />
              Add game
            </Button>
          </div>
        )}
      </fieldset>
      {save.error && (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {save.error instanceof HttpError && save.error.status === 409
              ? 'Your saved games changed in another session. Reload the saved set before trying again.'
              : save.error.message}{' '}
            Your draft has been kept.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setReloading(true)
              setReloadError('')
              try {
                const latest = await reload()
                setBaseline(latest)
                setDraft(latest)
                setGameId('')
                save.reset()
              } catch (error) {
                setReloadError(error instanceof Error ? error.message : 'Reload failed.')
              } finally {
                setReloading(false)
              }
            }}
          >
            Discard draft and reload saved games
          </Button>
        </div>
      )}
      {reloadError && (
        <p role="alert" className="text-sm text-destructive">
          {reloadError}
        </p>
      )}
      <div className="flex flex-wrap gap-4">
        <Button type="submit" disabled={!dirty || busy}>
          <Save aria-hidden="true" />
          {save.isPending ? 'Saving changes...' : 'Save changes'}
        </Button>
        {busy ? (
          <Button type="button" variant="outline" disabled>
            Cancel
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link to="/profile">Cancel</Link>
          </Button>
        )}
      </div>
    </form>
  )
}
