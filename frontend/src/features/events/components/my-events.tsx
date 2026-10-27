import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { FormSelect } from '@/components/form-select'
import { Label } from '@/components/ui/label'
import { useMyEvents } from '../api/use-my-events'
import { EventCard } from './event-card'

type MyEventsProps = {
  session: {
    viewerId: string | null
    getAccessToken: () => Promise<string | null>
    ready: boolean
    error: Error | null
  }
}
export function MyEvents({ session }: MyEventsProps) {
  const [params, setParams] = useSearchParams(),
    relation = params.get('relation') === 'joined' ? 'joined' : 'hosting'
  const rawPeriod = params.get('period') ?? 'upcoming',
    period = rawPeriod === 'past' || rawPeriod === 'all' ? rawPeriod : 'upcoming'
  const result = useMyEvents(
    session.viewerId,
    session.getAccessToken,
    relation,
    period,
    session.ready && !session.error,
  )
  const entries = result.data?.pages.flatMap((page) => page.items) ?? [],
    events = entries.filter((event, index) => entries.findIndex((item) => item.id === event.id) === index)
  return (
    <section className="space-y-6 py-4">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">My Events</h1>
        <p className="text-muted-foreground">
          Your hosted tables and current memberships. Private events are only shown while you have access.
        </p>
      </header>
      <nav aria-label="My event groups" className="flex flex-wrap gap-3">
        <Button
          variant={relation === 'hosting' ? 'default' : 'outline'}
          onClick={() => setParams({ relation: 'hosting', period })}
        >
          Events I host
        </Button>
        <Button
          variant={relation === 'joined' ? 'default' : 'outline'}
          onClick={() => setParams({ relation: 'joined', period })}
        >
          Events I've joined
        </Button>
      </nav>
      <div className="max-w-xs space-y-2">
        <Label htmlFor="my-events-period">Event timing</Label>
        <FormSelect
          id="my-events-period"
          value={period}
          onChange={(event) => setParams({ relation, period: event.target.value })}
        >
          <option value="upcoming">Upcoming</option>
          <option value="past">Finished</option>
          <option value="all">All my events</option>
        </FormSelect>
      </div>
      {session.error || result.error ? (
        <div role="alert" className="space-y-3 rounded-xl border bg-card p-6">
          <p>Your events couldn't be loaded. Your account access must be verified.</p>
          <Button variant="outline" onClick={() => void result.refetch()} disabled={!session.ready}>
            Retry my events
          </Button>
        </div>
      ) : result.isPending ? (
        <p role="status">Loading your events…</p>
      ) : (
        <>
          {events.length ? (
            <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
                <li key={event.id}>
                  <EventCard event={event} session={session} />
                </li>
              ))}
            </ul>
          ) : (
            <div role="status" className="space-y-4 rounded-xl border bg-card p-6">
              <p>No {relation === 'hosting' ? 'hosted' : 'joined'} events match this period.</p>
              <Button variant="outline" asChild>
                <Link to={relation === 'hosting' ? '/events/new' : '/events'}>
                  {relation === 'hosting' ? 'Host an event' : 'Explore events'}
                </Link>
              </Button>
            </div>
          )}
          {result.hasNextPage && (
            <Button
              variant="outline"
              disabled={result.isFetchingNextPage}
              onClick={() => void result.fetchNextPage()}
            >
              {result.isFetchingNextPage ? 'Loading…' : 'Load more events'}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
