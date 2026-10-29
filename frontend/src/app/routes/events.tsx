import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { EventsList } from '@/features/events/components/events-list'
import { useCatalogGames } from '@/features/games/api/use-catalog'
import { LocationFilterFields } from '@/features/geography/components/location-filter-fields'
import { useApiSession } from '@/features/users/api/use-auth'
import { JoinPrivateEvent } from '@/features/events/components/join-private-event'

export function Events() {
  const games = useCatalogGames()
  const session = useApiSession()
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-widest text-primary uppercase">
            Find your people. Play your game.
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Find your next game night</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <JoinPrivateEvent key={session.viewerId ?? 'guest'} session={session} />
          <Button asChild variant="outline">
            <Link to="/events/new">Host an event</Link>
          </Button>
        </div>
      </div>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
        Explore upcoming public tables and find a seat that feels like yours. Choose a country and city,
        or browse every game night in the community.
      </p>
      <EventsList
        session={session}
        games={games.data}
        gamesPending={games.isPending}
        gamesError={Boolean(games.error)}
        retryGames={() => void games.refetch()}
        locationFilters={<LocationFilterFields idPrefix="filter-location" />}
      />
    </section>
  )
}
