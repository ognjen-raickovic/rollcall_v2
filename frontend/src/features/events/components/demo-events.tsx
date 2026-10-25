import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useEvents } from '../api/use-events'

export function DemoEvents() {
  const events = useEvents()
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Development demo events</h1>
      <p className="max-w-2xl text-muted-foreground">
        These numeric fixtures are separate from public events. Demo changes stay in memory and reset on
        reload. Real accounts cannot act as demo players.
      </p>
      <div className="flex flex-wrap gap-4">
        <Button asChild>
          <Link to="/demo/events/new">Create demo event</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/demo/login">Choose demo player</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/events">Explore real events</Link>
        </Button>
      </div>
      {events.isPending ? (
        <p role="status">Loading demo events...</p>
      ) : events.error ? (
        <div role="alert" className="space-y-4">
          <p>Demo events could not be loaded.</p>
          <Button variant="outline" onClick={() => void events.refetch()}>
            Try again
          </Button>
        </div>
      ) : !events.data?.length ? (
        <p role="status">No public demo events are available.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.data.map((event) => (
            <li key={event.id} className="space-y-2 rounded-xl border bg-card p-6">
              <Link className="font-semibold text-primary underline" to={`/demo/events/${event.id}`}>
                {event.title}
              </Link>
              <p className="text-sm text-muted-foreground">{event.city} · Demo event</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
