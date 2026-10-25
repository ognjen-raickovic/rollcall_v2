import { useSearchParams } from 'react-router'
import { CalendarDays, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { eventDiscoveryFiltersSchema } from '../api/event-dtos'
import { usePersistentEvents } from '../api/use-persistent-events'
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
  const country = (params.get('country') ?? '').toUpperCase()
  const category = params.get('category') ?? ''
  const rawGameId = params.get('gameId') ?? ''
  const rawCityId = params.get('cityId') ?? ''
  const rawAvailability = params.get('availableOnly') ?? ''
  const rawLimit = params.get('limit') ?? ''
  const allowedKeys = [
    'search',
    'country',
    'city',
    'cityId',
    'region',
    'gameId',
    'category',
    'availableOnly',
    'limit',
  ]
  const invalidUrl =
    [...params.keys()].some((key) => !allowedKeys.includes(key) || params.getAll(key).length !== 1) ||
    !['', 'true', 'false'].includes(rawAvailability) ||
    Boolean(
      category && !['role-playing', 'trading-card', 'board-game', 'social-deduction'].includes(category),
    ) ||
    [rawGameId, rawCityId, rawLimit].some((value) => value !== '' && !/^[1-9]\d*$/.test(value)) ||
    Boolean(city && !rawCityId)
  const filters = eventDiscoveryFiltersSchema.safeParse({
    search: search || undefined,
    country: country || undefined,
    cityId: rawCityId ? Number(rawCityId) : undefined,
    gameId: rawGameId ? Number(rawGameId) : undefined,
    availableOnly: rawAvailability === 'true',
    upcomingOnly: true,
    status: 'scheduled',
    limit: rawLimit ? Number(rawLimit) : 12,
  })
  const invalid = invalidUrl || !filters.success
  const result = usePersistentEvents(filters.success ? filters.data : {}, !invalid, category)
  const loaded = result.data?.pages.flatMap((page) => page.items) ?? []
  const unique = loaded.filter((event, index) => loaded.findIndex((item) => item.id === event.id) === index)
  const events = category ? unique.filter((event) => event.game.category === category) : unique
  const pending = result.isPending || gamesPending
  const loadError = result.isFetchNextPageError
  const error = gamesError || (result.error && !loadError)
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
        availableOnly={rawAvailability === 'true'}
        locationFilters={locationFilters}
        games={games}
        pending={gamesPending}
        filterKey={params.toString()}
      />
      {invalid ? (
        <div role="alert" className="space-y-4 rounded-xl border bg-card p-8">
          <p className="font-semibold">One of these filters isn’t valid.</p>
          <p className="text-sm text-muted-foreground">
            Reset the filters and choose a country, city suggestion, game or availability from the list.
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
      ) : (
        <>
          {events.length ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p role="status" className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{events.length}</span> upcoming{' '}
                  {events.length === 1 ? 'event' : 'events'} loaded
                  {city ? ` in ${city}` : country ? ' in the selected country' : ' across our community'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Soonest first · Times shown in your local timezone
                </p>
              </div>
              <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {events.map((event) => (
                  <li key={event.id}>
                    <EventCard event={event} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div role="status" className="space-y-4 rounded-xl border bg-card p-8 text-center">
              <CalendarDays className="mx-auto size-8 text-primary" aria-hidden="true" />
              <p className="font-semibold">
                {result.hasNextPage && category
                  ? 'No matching category events in the pages loaded so far.'
                  : 'No upcoming events match your filters.'}
              </p>
              <p className="text-sm text-muted-foreground">
                {result.hasNextPage && category
                  ? 'Load more events to keep exploring this category.'
                  : 'Try another country, city or game, or include full tables.'}
              </p>
              <Button variant="outline" onClick={() => setParams({})}>
                Show all upcoming events
              </Button>
            </div>
          )}
          {category && result.hasNextPage && (
            <p className="text-sm text-muted-foreground">
              Category results are filtered from the pages loaded so far. Load more to explore later tables.
            </p>
          )}
          {loadError && (
            <div role="alert" className="space-y-3 rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                More events couldn’t be loaded. The events above are still available.
              </p>
              <Button variant="outline" onClick={() => void result.fetchNextPage()}>
                Try loading more again
              </Button>
            </div>
          )}
          {result.hasNextPage && !loadError && (
            <div className="text-center">
              <Button
                variant="outline"
                disabled={result.isFetchingNextPage}
                onClick={() => void result.fetchNextPage()}
              >
                {result.isFetchingNextPage && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {result.isFetchingNextPage ? 'Loading more events...' : 'Load more events'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
