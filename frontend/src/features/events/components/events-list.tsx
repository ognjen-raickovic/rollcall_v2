import { useSearchParams } from 'react-router'
import { CalendarDays } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { useEvents } from '../api/use-events'
import { EventCard } from './event-card'
import { EventFilters } from './event-filters'
import { EventNotice } from './event-notice'

type EventsListProps = {
  games?: { id: number; name: string; category: string }[]
  gamesPending: boolean
  gamesError: boolean
  retryGames: () => void
}

export function EventsList({ games = [], gamesPending, gamesError, retryGames }: EventsListProps) {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const city = params.get('city') ?? ''
  const category = params.get('category') ?? ''
  const rawGameId = params.get('gameId') ?? ''
  const gameId = rawGameId ? Number(rawGameId) : undefined
  const rawAvailability = params.get('availableOnly') ?? ''
  const availableOnly = rawAvailability === 'true'
  const invalidGameId =
    Boolean(rawGameId) && (!/^\d+$/.test(rawGameId) || !Number.isSafeInteger(gameId) || Number(gameId) < 1)
  const invalidAvailability = !['', 'true', 'false'].includes(rawAvailability)
  const invalidCategory =
    Boolean(category) && !gamesPending && !gamesError && !games.some((game) => game.category === category)
  const catalog = useEvents({ upcomingOnly: true, visibility: 'public' })
  const result = useEvents({
    search,
    city,
    gameId: invalidGameId ? undefined : gameId,
    availableOnly,
    upcomingOnly: true,
    visibility: 'public',
  })
  const matchingGameIds = new Set(games.filter((game) => game.category === category).map((game) => game.id))
  const events = category ? result.data?.filter((event) => matchingGameIds.has(event.gameId)) : result.data
  const cities = [...new Set(catalog.data?.map((event) => event.city))].sort((a, b) => a.localeCompare(b))
  // Match the canonical option value when an incoming URL uses different city capitalization.
  const selectedCity = cities.find((item) => item.toLowerCase() === city.trim().toLowerCase()) ?? city
  const pending = result.isPending || catalog.isPending || gamesPending
  const error = result.error || catalog.error || gamesError
  const invalid = invalidGameId || invalidAvailability || invalidCategory

  function retry() {
    if (gamesError) retryGames()
    void catalog.refetch()
    void result.refetch()
  }

  return (
    <div className="mt-8 space-y-6">
      <EventNotice />
      <EventFilters
        search={search}
        city={selectedCity}
        gameId={rawGameId}
        category={category}
        availableOnly={availableOnly}
        cities={cities}
        games={games}
        pending={catalog.isPending || gamesPending}
        filterKey={params.toString()}
      />
      {invalid ? (
        <div role="alert" className="space-y-4 rounded-xl border bg-card p-8">
          <p className="font-semibold">One of these filters isn’t valid.</p>
          <p className="text-sm text-muted-foreground">
            Reset the filters and choose a city, game, or availability from the list.
          </p>
          <Button variant="outline" onClick={() => setParams({})}>
            Reset filters
          </Button>
        </div>
      ) : pending ? (
        <div role="status" aria-label="Loading events" className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-96" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="space-y-4 rounded-xl border bg-card p-8">
          <p className="font-semibold">We couldn’t load the event collection.</p>
          <p className="text-sm text-muted-foreground">Please try again. Your filters will stay in place.</p>
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
          <Button variant="ghost" onClick={() => setParams({})}>
            Reset filters
          </Button>
        </div>
      ) : !events?.length ? (
        <div role="status" className="space-y-4 rounded-xl border bg-card p-8 text-center">
          <CalendarDays className="mx-auto size-8 text-primary" aria-hidden="true" />
          <p className="font-semibold">No upcoming events match your filters.</p>
          <p className="text-sm text-muted-foreground">
            Try another city or game, or include full tables. Your next group might be one filter away.
          </p>
          <Button variant="outline" onClick={() => setParams({})}>
            Show all upcoming events
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p role="status" className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{events.length}</span> upcoming{' '}
              {events.length === 1 ? 'event' : 'events'}
              {city ? ` in ${selectedCity}` : ' across Montenegro'}
            </p>
            <p className="text-xs text-muted-foreground">
              Soonest first · Times shown in your local timezone
            </p>
          </div>
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => {
              const game = games.find((item) => item.id === event.gameId)
              return (
                <li key={event.id}>
                  <EventCard event={event} gameName={game?.name} category={game?.category} />
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
