import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { EventsList } from '@/features/events/components/events-list'
import { useGames } from '@/features/games/api/use-games'

export function Events() {
  const games = useGames()
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Events</h1>
        <Button asChild variant="outline">
          <Link to="/events/new">Host an event</Link>
        </Button>
      </div>
      <p className="mt-4 text-muted-foreground">Explore tabletop meetups. This preview uses sample events.</p>
      <EventsList
        games={games.data}
        gamesPending={games.isPending}
        gamesError={Boolean(games.error)}
        retryGames={() => void games.refetch()}
      />
    </section>
  )
}
