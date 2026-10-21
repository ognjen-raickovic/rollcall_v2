import { MapPin, Search, X } from 'lucide-react'
import { Form, Link, useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

import { useEvents } from '../api/use-events'
import { EventCard } from './event-card'

type EventsListProps = {
  games?: { id: number; name: string; category: string }[]
  gamesPending: boolean
  gamesError: boolean
  retryGames: () => void
}

export function EventsList({ games, gamesPending, gamesError, retryGames }: EventsListProps) {
  const [params] = useSearchParams()
  const search = params.get('search') ?? ''
  const city = params.get('city') ?? ''
  const category = params.get('category') ?? ''
  const rawGameId = params.get('gameId')
  const gameId = rawGameId ? Number(rawGameId) : undefined
  const availableOnly = params.get('availableOnly') === 'true'
  const invalidGameId =
    rawGameId !== null && (!/^\d+$/.test(rawGameId) || !Number.isSafeInteger(gameId) || Number(gameId) < 1)
  const { data, isPending, error, refetch } = useEvents({
    search,
    city,
    gameId: invalidGameId ? undefined : gameId,
    availableOnly,
  })
  const matchingGameIds = new Set(games?.filter((game) => game.category === category).map((game) => game.id))
  const events = category ? data?.filter((event) => matchingGameIds.has(event.gameId)) : data
  const categoryPending = Boolean(category) && gamesPending
  const categoryError = Boolean(category) && gamesError
  const hasFilters = Boolean(search || city || category || rawGameId || availableOnly)

  return (
    <div className="mt-8 space-y-6">
      <Form
        key={params.toString()}
        method="get"
        action="/events"
        role="search"
        aria-label="Filter events"
        className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-[1fr_1fr_auto] md:items-end md:p-6"
      >
        {category && <input type="hidden" name="category" value={category} />}
        {rawGameId && <input type="hidden" name="gameId" value={rawGameId} />}
        {availableOnly && <input type="hidden" name="availableOnly" value="true" />}
        <div className="space-y-2">
          <Label htmlFor="event-search">
            <Search className="size-4 text-primary" aria-hidden="true" /> Search events
          </Label>
          <Input
            id="event-search"
            name="search"
            defaultValue={search}
            maxLength={100}
            placeholder="Search titles, descriptions, or venues"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-city">
            <MapPin className="size-4 text-primary" aria-hidden="true" /> City
          </Label>
          <Input id="event-city" name="city" defaultValue={city} maxLength={80} placeholder="Any city" />
        </div>
        <Button type="submit">Find events</Button>
      </Form>
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {category && (
            <span className="rounded-md bg-accent px-3 py-1 text-accent-foreground">
              {category.replaceAll('-', ' ')}
            </span>
          )}
          {availableOnly && <span>Open seats only</span>}
          <Link
            to="/events"
            className="inline-flex min-h-10 items-center gap-2 text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-4" aria-hidden="true" /> Clear filters
          </Link>
        </div>
      )}
      {invalidGameId ? (
        <div role="alert" className="space-y-4">
          <p>This game filter isn’t valid.</p>
          <Button asChild variant="outline">
            <Link to="/events">Reset filters</Link>
          </Button>
        </div>
      ) : isPending || categoryPending ? (
        <div role="status" aria-label="Loading events" className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-96" />
          ))}
        </div>
      ) : error || categoryError ? (
        <div role="alert" className="space-y-4">
          <p>Events could not be loaded.</p>
          <Button
            variant="outline"
            onClick={() => {
              if (categoryError) retryGames()
              void refetch()
            }}
          >
            Try again
          </Button>
        </div>
      ) : !events?.length ? (
        <div role="status" className="space-y-4 rounded-xl border bg-card p-8 text-center">
          <p className="font-semibold">No events match your search.</p>
          <p className="text-sm text-muted-foreground">
            Try another game or city, or clear your filters to see every table.
          </p>
          <Button asChild variant="outline">
            <Link to="/events">Show all events</Link>
          </Button>
        </div>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <li key={event.id}>
              <EventCard
                event={event}
                gameName={games?.find((game) => game.id === event.gameId)?.name}
                category={games?.find((game) => game.id === event.gameId)?.category}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
