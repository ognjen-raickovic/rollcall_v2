import { useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { useEvents } from '../api/use-events'

export function EventsList() {
  const [search, setSearch] = useState('')
  const { data: events, isPending, error, refetch } = useEvents({ search })

  return (
    <div className="mt-8 space-y-6">
      <div className="max-w-md space-y-2">
        <Label htmlFor="event-search">Search events</Label>
        <Input
          id="event-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search titles, descriptions, or venues"
        />
      </div>
      {isPending ? (
        <p role="status" className="text-muted-foreground">
          Loading events...
        </p>
      ) : error ? (
        <div role="alert" className="space-y-4">
          <p>Events could not be loaded.</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : !events?.length ? (
        <p role="status" className="text-muted-foreground">
          No events match your search.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {events.map((event) => (
            <li key={event.id} className="space-y-2 p-4">
              <Link
                to={`/events/${event.id}`}
                className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                {event.title}
              </Link>
              <p className="text-sm text-muted-foreground">
                <time dateTime={event.startsAt}>
                  {new Date(event.startsAt).toLocaleString('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>{' '}
                · {event.city} · {event.attendeeIds.length}/{event.capacity} players · {event.status}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
