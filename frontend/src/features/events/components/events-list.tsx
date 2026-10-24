import { useSearchParams } from 'react-router'
import { CalendarDays } from 'lucide-react'
import type { ReactNode } from 'react'

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
  locationFilters: ReactNode
}

export function EventsList({
  games = [],
  gamesPending,
  gamesError,
  retryGames,
  locationFilters,
}: EventsListProps) {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const city = params.get('city') ?? ''
  const country = (params.get('country') ?? (city ? 'ME' : '')).toUpperCase()
  const rawCityId = params.get('cityId') ?? ''
  const cityId = rawCityId ? Number(rawCityId) : undefined
  const invalidLocation =
    (Boolean(country) && !/^[A-Z]{2}$/.test(country)) ||
    (Boolean(rawCityId) &&
      (!country || !/^\d+$/.test(rawCityId) || !Number.isSafeInteger(cityId) || Number(cityId) < 1))
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
  const result = useEvents({
    search,
    city,
    country: country || undefined,
    cityId: invalidLocation ? undefined : cityId,
    gameId: invalidGameId ? undefined : gameId,
    availableOnly,
    upcomingOnly: true,
    visibility: 'public',
  })
  const matchingGameIds = new Set(games.filter((game) => game.category === category).map((game) => game.id))
  const events = category ? result.data?.filter((event) => matchingGameIds.has(event.gameId)) : result.data
  const pending = result.isPending || gamesPending
  const error = result.error || gamesError
  const invalid = invalidGameId || invalidAvailability || invalidCategory || invalidLocation

  function retry() {
    if (gamesError) retryGames()
    void result.refetch()
  }

  return (
    <div className="mt-8 space-y-6">
      <EventNotice />
      <EventFilters
        search={search}
        gameId={rawGameId}
        category={category}
        availableOnly={availableOnly}
        locationFilters={locationFilters}
        games={games}
        pending={gamesPending}
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
              {city ? ` in ${city}` : country ? ' in the selected country' : ' across our community'}
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
