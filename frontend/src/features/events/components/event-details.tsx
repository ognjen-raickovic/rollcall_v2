import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/mock-db'

import { useEvent } from '../api/use-events'

type EventDetailsProps = { eventId: string | undefined }

export function EventDetails({ eventId }: EventDetailsProps) {
  const id = Number(eventId)
  const validId = /^\d+$/.test(eventId ?? '') && Number.isSafeInteger(id) && id > 0
  const { data: event, isPending, error, refetch } = useEvent(validId ? id : 0)

  if (!validId)
    return (
      <section>
        <h1 className="text-3xl font-bold">Invalid event ID</h1>
        <p className="mt-4 text-muted-foreground">Choose an event from the events list.</p>
      </section>
    )
  if (isPending)
    return (
      <p role="status" className="text-muted-foreground">
        Loading event...
      </p>
    )
  if (error || !event)
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">
          {error instanceof ApiError && error.code === 'NOT_FOUND'
            ? 'Event not found'
            : 'Event could not be loaded'}
        </h1>
        <p role="alert">{error?.message ?? 'This event is unavailable.'}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </section>
    )

  return (
    <section className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">{event.title}</h1>
      <p className="text-muted-foreground">{event.description}</p>
      <dl className="space-y-4 text-sm">
        <div>
          <dt className="font-semibold">When (your local time)</dt>
          <dd className="text-muted-foreground">
            <time dateTime={event.startsAt}>{new Date(event.startsAt).toLocaleString('en-GB')}</time> –{' '}
            <time dateTime={event.endsAt}>{new Date(event.endsAt).toLocaleString('en-GB')}</time>
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Where</dt>
          <dd className="text-muted-foreground">
            {event.venue}, {event.address}, {event.city}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Players and experience</dt>
          <dd className="text-muted-foreground">
            {event.attendeeIds.length}/{event.capacity} player seats · {event.experienceLevel}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Price and status</dt>
          <dd className="text-muted-foreground">
            {event.price === 0
              ? 'Free'
              : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(
                  event.price,
                )}{' '}
            · {event.status}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        Organizer #{event.organizerId} · Game #{event.gameId}. Profile, game, and participation controls will
        follow in later page work.
      </p>
      <Button asChild variant="outline">
        <Link to={`/events/${event.id}/edit`}>Edit event placeholder</Link>
      </Button>
    </section>
  )
}
