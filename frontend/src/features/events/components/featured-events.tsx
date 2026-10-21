import { useState } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { useEvents } from '../api/use-events'
import { EventCard } from './event-card'

type FeaturedEventsProps = { games?: { id: number; name: string; category: string }[] }

export function FeaturedEvents({ games }: FeaturedEventsProps) {
  const [startsAfter] = useState(() => new Date().toISOString())
  const events = useEvents({ status: 'scheduled', startsAfter })
  return (
    <section id="upcoming" aria-labelledby="upcoming-title" className="scroll-mt-8 border-t py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-widest text-primary uppercase">
            Less scrolling. More rolling.
          </p>
          <h2 id="upcoming-title" className="text-2xl font-bold tracking-tight">
            Coming to a table near you
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Upcoming game nights worth clearing your calendar for.
          </p>
        </div>
        <Link
          to="/events"
          className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Explore all events <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {events.isPending ? (
        <div role="status" aria-label="Loading upcoming events" className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-96" />
          ))}
        </div>
      ) : events.error ? (
        <div role="alert" className="space-y-4 rounded-xl border bg-card p-8">
          <p>We couldn’t load upcoming events.</p>
          <Button variant="outline" onClick={() => void events.refetch()}>
            Try again
          </Button>
        </div>
      ) : !events.data?.length ? (
        <div role="status" className="space-y-4 rounded-xl border bg-card p-8 text-center">
          <CalendarDays className="mx-auto size-8 text-primary" aria-hidden="true" />
          <p className="font-semibold">The next game night is on its way.</p>
          <p className="text-sm text-muted-foreground">
            No upcoming events right now. Browse the full event collection.
          </p>
          <Button asChild variant="outline">
            <Link to="/events">Browse events</Link>
          </Button>
        </div>
      ) : (
        <ul className="grid gap-6 md:grid-cols-3">
          {events.data.slice(0, 3).map((event) => {
            const game = games?.find((item) => item.id === event.gameId)
            return (
              <li key={event.id}>
                <EventCard event={event} gameName={game?.name} category={game?.category} />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
