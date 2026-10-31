import { Link2, LockKeyhole, LockKeyholeOpen, MapPin, Users } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import type { ReactNode, MouseEvent } from 'react'

import type { EventSummary, MyEventSummary } from '../api/event-dtos'
import { PersistentEventImage } from './persistent-event-image'
import type { EventActionSession } from '../api/event-write-dtos'
import { EventRequirementBadges } from './event-requirement-badges'
import { eventLifecycle } from '../event-lifecycle'
import { useEventTime } from '../hooks/use-event-time'

type EventCardProps = {
  event: EventSummary | MyEventSummary
  session?: EventActionSession
  preview?: boolean
  action?: ReactNode
}

export function EventCard({ event, session, preview = false, action }: EventCardProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const to = `/events/${event.id}${preview ? location.search : ''}`
  function openPreview(event: MouseEvent<HTMLAnchorElement>) {
    if (!preview || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return
    event.preventDefault()
    void navigate(to, {
      preventScrollReset: true,
      state: {
        eventPreview: {
          from: `/events${location.search}`,
          focusId: event.currentTarget.id,
          scrollY: window.scrollY,
        },
      },
    })
  }
  const date = new Date(event.startsAt)
  const now = useEventTime(event.startsAt, event.endsAt)
  const lifecycle = eventLifecycle(event, now)
  const VisibilityIcon = { public: LockKeyholeOpen, private: LockKeyhole, unlisted: Link2 }[event.visibility]
  const seats = event.availableSlots
  const availability =
    lifecycle !== 'Upcoming'
      ? lifecycle
      : seats > 0
        ? `${seats} ${seats === 1 ? 'seat' : 'seats'} open`
        : 'Full · 0 seats open'
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/60">
      <Link
        id={`event-image-${event.id}`}
        to={to}
        onClick={openPreview}
        preventScrollReset={preview}
        aria-label={`View ${event.title}`}
        className="relative flex h-40 items-center justify-center overflow-hidden bg-secondary focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
      >
        <PersistentEventImage
          eventId={event.id}
          session={session}
          cover={event.cover}
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
        <span
          className="absolute top-4 right-4 rounded-md border bg-card p-2 text-foreground"
          aria-label={`Visibility: ${event.visibility}`}
          role="img"
          title={`${event.visibility[0]?.toUpperCase()}${event.visibility.slice(1)} event`}
        >
          <VisibilityIcon className="size-4" aria-hidden="true" />
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
          id={`event-title-${event.id}`}
          to={to}
          onClick={openPreview}
          preventScrollReset={preview}
          className="line-clamp-2 min-h-12 text-lg leading-snug font-semibold tracking-tight hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          {event.title}
        </Link>
        <span
          aria-label={`Event status: ${lifecycle}`}
          className="w-fit rounded-full border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
        >
          {lifecycle}
        </span>
        <EventRequirementBadges experienceLevel={event.experienceLevel} minimumAge={event.minimumAge} />
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-1 size-4 shrink-0" aria-hidden="true" />
          {[event.venue, event.city.name, event.country.name].filter(Boolean).join(', ')}
        </p>
        <div className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-t pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-2 whitespace-nowrap">
            <Users className="size-4" aria-hidden="true" />
            {event.participantCount}/{event.capacity} players
          </span>
          {!action && lifecycle === 'Upcoming' && <span>{availability}</span>}
          {action}
        </div>
      </div>
    </article>
  )
}
