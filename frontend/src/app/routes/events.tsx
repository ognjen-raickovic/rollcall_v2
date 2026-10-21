import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { EventsList } from '@/features/events/components/events-list'
import { useGames } from '@/features/games/api/use-games'

export function Events() {
  const games = useGames()
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-widest text-primary uppercase">
            Find your people. Play your game.
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Game nights in Montenegro</h1>
        </div>
        <Button asChild variant="outline">
          <Link to="/events/new">Host an event</Link>
        </Button>
      </div>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
        From first adventures in Podgorica to seaside board games in Budva. Explore upcoming public tables and
        find a seat that feels like yours.
      </p>
      <EventsList
        games={games.data}
        gamesPending={games.isPending}
        gamesError={Boolean(games.error)}
        retryGames={() => void games.refetch()}
      />
    </section>
  )
}
