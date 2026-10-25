import { ArrowUpRight, MapPin, Users } from 'lucide-react'
import { Link } from 'react-router'

import type { EventSummary } from '../api/event-dtos'
import { EventImage } from './event-image'

type EventCardProps = { event: EventSummary }

export function EventCard({ event }: EventCardProps) {
  const date = new Date(event.startsAt)
  const seats = event.availableSlots
  const availability = seats > 0 ? `${seats} ${seats === 1 ? 'seat' : 'seats'} open` : 'Full · 0 seats open'
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/60">
      <Link
        to={`/events/${event.id}`}
        aria-label={`View ${event.title}`}
        className="relative flex h-40 items-center justify-center overflow-hidden bg-secondary focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
      >
        <EventImage
          src={event.cover.imageUrl}
          title={event.title}
          category={event.game.category}
          className="absolute inset-0"
        />
        <span className="absolute top-4 left-4 rounded-md border bg-card px-3 py-2 text-center">
          <span className="block text-xs font-semibold text-primary uppercase">
            {date.toLocaleDateString('en-GB', { month: 'short' })}
          </span>
          <span className="block text-xl leading-tight font-bold">{date.getDate()}</span>
        </span>
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-6">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">
          {event.game.name} ·{' '}
          <time dateTime={event.startsAt}>
            {date.toLocaleDateString('en-GB', { weekday: 'short' })},{' '}
            {date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </time>
        </p>
        <Link
          to={`/events/${event.id}`}
          className="text-lg leading-snug font-semibold tracking-tight hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          {event.title}
        </Link>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-1 size-4 shrink-0" aria-hidden="true" />
          {[event.venue, event.city.name, event.country.name].filter(Boolean).join(', ')}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <Users className="size-4" aria-hidden="true" />
            {event.participantCount}/{event.capacity} players
          </span>
          <span className="flex items-center gap-2 text-primary">
            {availability}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </article>
  )
}
