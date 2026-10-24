import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Form, Link } from 'react-router'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type EventFiltersProps = {
  search: string
  gameId: string
  category: string
  availableOnly: boolean
  locationFilters: ReactNode
  games: { id: number; name: string }[]
  pending: boolean
  filterKey: string
}

export function EventFilters({
  search,
  gameId,
  category,
  availableOnly,
  locationFilters,
  games,
  pending,
  filterKey,
}: EventFiltersProps) {
  const selectStyle =
    'h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
  return (
    <Form
      key={filterKey}
      action="/events"
      method="get"
      role="search"
      aria-label="Filter gaming events"
      className="space-y-4 rounded-xl border bg-card p-4 md:p-6 [&_label]:min-h-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" /> Find your kind of game
          night
        </p>
        <Link
          to="/events"
          className="inline-flex min-h-10 items-center gap-2 text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X className="size-4" aria-hidden="true" /> Reset filters
        </Link>
      </div>
      {category && <input type="hidden" name="category" value={category} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="event-search">
            <Search className="size-4 text-primary" aria-hidden="true" /> Event title
          </Label>
          <Input
            id="event-search"
            name="search"
            defaultValue={search}
            maxLength={100}
            placeholder="D&D, Commander, Catan..."
            className="h-11 bg-background"
          />
        </div>
        {locationFilters}
        <div className="min-w-0 space-y-2">
          <Label htmlFor="event-game">Game</Label>
          <select
            key={`${pending}-${games.length}-${gameId}`}
            id="event-game"
            name="gameId"
            defaultValue={gameId}
            className={selectStyle}
            disabled={pending}
          >
            <option value="">All games</option>
            {gameId && !games.some((game) => String(game.id) === gameId) && (
              <option value={gameId}>Unavailable game</option>
            )}
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="event-availability">Availability</Label>
          <select
            id="event-availability"
            name="availableOnly"
            defaultValue={availableOnly ? 'true' : ''}
            className={selectStyle}
          >
            <option value="">All events</option>
            <option value="true">Open seats only</option>
          </select>
        </div>
        <Button type="submit" className="h-11 lg:mt-6" disabled={pending}>
          <Search aria-hidden="true" /> Search
        </Button>
      </div>
      {category && (
        <p className="text-sm text-muted-foreground">
          Category:{' '}
          <span className="font-medium text-accent-foreground">{category.replaceAll('-', ' ')}</span>. Reset
          filters to explore every category.
        </p>
      )}
    </Form>
  )
}
