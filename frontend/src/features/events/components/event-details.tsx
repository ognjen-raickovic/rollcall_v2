import type { ReactNode } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Globe2,
  Link2,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  Tag,
  Users,
} from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/mock-db'
import { loginPath } from '@/lib/auth-navigation'

import { useEvent } from '../api/use-events'
import { EventAttendance } from './event-attendance'
import { EventImage } from './event-image'
import { EventNotice } from './event-notice'

type EventDetailsProps = {
  eventId: string | undefined
  currentUserId: number | null
  sessionPending: boolean
  sessionError: boolean
  participationUnavailable?: boolean
  renderHost: (userId: number) => ReactNode
  renderGame: (gameId: number) => ReactNode
}

export function EventDetails({
  eventId,
  currentUserId,
  sessionPending,
  sessionError,
  participationUnavailable,
  renderHost,
  renderGame,
}: EventDetailsProps) {
  const id = Number(eventId)
  const validId = /^\d+$/.test(eventId ?? '') && Number.isSafeInteger(id) && id > 0
  const location = useLocation()
  const { data: event, isPending, error, refetch } = useEvent(validId ? id : 0, currentUserId)
  const backLink = (
    <Link
      to="/events"
      className="inline-flex min-h-10 items-center gap-2 text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ArrowLeft className="size-4" aria-hidden="true" /> Back to events
    </Link>
  )

  if (!validId)
    return (
      <section className="space-y-4 py-8">
        <h1 className="text-3xl font-bold">Invalid event ID</h1>
        <p className="text-muted-foreground">Choose a table from our upcoming event collection.</p>
        {backLink}
      </section>
    )
  if (isPending || sessionPending)
    return (
      <section role="status" aria-label="Loading event details" className="space-y-6">
        <span className="sr-only">Loading event details...</span>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="aspect-[16/7] w-full" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </section>
    )
  // A successful private leave returns the final snapshot, then revokes read access.
  // Redirect before a refetch error can unmount the participation success callback.
  if (
    event?.visibility === 'private' &&
    currentUserId !== null &&
    event.organizerId !== currentUserId &&
    !event.attendeeIds.includes(currentUserId)
  ) {
    return <Navigate to="/events" replace state={{ eventNotice: 'You’ve left the private event.' }} />
  }
  if (error || !event) {
    const missing = error instanceof ApiError && error.code === 'NOT_FOUND'
    const restricted = error instanceof ApiError && ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.code)
    return (
      <section className="space-y-4 rounded-xl border bg-card p-8">
        <h1 className="text-3xl font-bold">
          {missing ? 'Event not found' : restricted ? 'Private event' : 'Event could not be loaded'}
        </h1>
        <p role="alert" className="text-muted-foreground">
          {restricted
            ? 'Only the host and current participants can view this event. Log in with an authorized demo profile to continue.'
            : missing
              ? 'This table may have been removed, or the link may be incorrect. There are more game nights to explore.'
              : 'Please try again in a moment.'}
        </p>
        {restricted && !currentUserId && (
          <Button asChild>
            <Link to={loginPath(`${location.pathname}${location.search}${location.hash}`)}>
              Log in to view event
            </Link>
          </Button>
        )}
        {!missing && !restricted && (
          <Button variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        )}
        <div>{backLink}</div>
      </section>
    )
  }

  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  const experience = {
    'all-levels': 'All experience levels',
    beginner: 'Beginner friendly',
    experienced: 'Experienced players',
  }[event.experienceLevel]
  const visibility = { public: 'Public event', private: 'Private event', unlisted: 'Unlisted event' }[
    event.visibility
  ]
  const VisibilityIcon =
    event.visibility === 'public' ? Globe2 : event.visibility === 'private' ? LockKeyhole : Link2
  const countryName = event.location?.countryName ?? 'Montenegro'
  const cityName = event.location?.cityName ?? event.city
  const canViewAddress =
    currentUserId !== null &&
    (event.organizerId === currentUserId || event.attendeeIds.includes(currentUserId))

  return (
    <div className="space-y-8">
      {backLink}
      <EventNotice />
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold tracking-wide text-primary uppercase">
          <span className="flex items-center gap-2">
            <MapPin className="size-4" aria-hidden="true" /> {cityName}, {countryName}
          </span>
          <span className="rounded-md bg-accent px-3 py-1 text-accent-foreground">{visibility}</span>
        </div>
        <h1 className="max-w-4xl text-3xl font-bold tracking-tight md:text-4xl">{event.title}</h1>
        <p className="text-base text-muted-foreground">
          {start.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}{' '}
          {event.venue && <> · {event.venue}</>}
        </p>
      </header>
      <EventImage
        src={event.imageUrl}
        title={event.title}
        priority
        className="aspect-[16/7] max-h-64 w-full rounded-xl border"
      />
      <div className="grid items-start gap-8 lg:grid-cols-3">
        <div className="order-2 min-w-0 space-y-8 lg:order-1 lg:col-span-2">
          <section aria-label="Game information" className="rounded-xl border bg-card p-6">
            {renderGame(event.gameId)}
          </section>
          <section aria-labelledby="about-event" className="space-y-4">
            <h2 id="about-event" className="text-2xl font-bold tracking-tight">
              About this game night
            </h2>
            <p className="max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground">
              {event.description}
            </p>
          </section>
          <section aria-labelledby="event-essentials" className="space-y-6 rounded-xl border bg-card p-6">
            <h2 id="event-essentials" className="text-2xl font-bold tracking-tight">
              The essentials
            </h2>
            <dl className="grid gap-6 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <dt className="text-sm font-semibold">Date and time</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    <time dateTime={event.startsAt}>
                      {start.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                    <br />
                    to{' '}
                    <time dateTime={event.endsAt}>
                      {end.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                    <span className="mt-1 block text-xs">Your local timezone</span>
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <dt className="text-sm font-semibold">Location</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {event.venue && <span className="block">{event.venue}</span>}
                    {canViewAddress ? (
                      <span className="block">{event.address}</span>
                    ) : (
                      <span className="mb-2 block">
                        Exact address is shared with the host and confirmed participants.
                      </span>
                    )}
                    {cityName}, {countryName}
                    {event.location?.administrativeDivision && (
                      <span className="block">{event.location.administrativeDivision}</span>
                    )}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <dt className="text-sm font-semibold">Who can play</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {experience}
                    <br />
                    {event.minimumAge === 0 ? 'All ages welcome' : `Ages ${event.minimumAge} and up`}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <VisibilityIcon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <dt className="text-sm font-semibold">Visibility</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {visibility}
                    <br />
                    {event.visibility === 'public'
                      ? 'Discoverable by everyone'
                      : event.visibility === 'private'
                        ? 'Host and current participants only'
                        : 'Shared by direct link'}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <dt className="text-sm font-semibold">Participants</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    {event.attendeeIds.length} of {event.capacity} player seats filled
                    <span className="mt-1 block text-xs">The host has a separate seat</span>
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock3 className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <dt className="text-sm font-semibold">Event status</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    {event.status === 'cancelled'
                      ? 'Canceled'
                      : start.getTime() <= Date.now()
                        ? 'Started or completed'
                        : 'Scheduled'}
                  </dd>
                </div>
              </div>
            </dl>
          </section>
          <section aria-labelledby="event-tags" className="space-y-4">
            <h2 id="event-tags" className="flex items-center gap-3 text-2xl font-bold tracking-tight">
              <Tag className="size-5 text-primary" aria-hidden="true" /> What to expect
            </h2>
            {event.tags.length ? (
              <ul className="flex flex-wrap gap-2">
                {event.tags.map((tag) => (
                  <li key={tag} className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
                    {tag}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No additional tags for this event.</p>
            )}
          </section>
        </div>
        <aside
          aria-label="Participation and host"
          className="order-1 space-y-6 lg:order-2 lg:sticky lg:top-8"
        >
          <EventAttendance
            key={`${event.id}-${currentUserId ?? 'guest'}`}
            event={event}
            currentUserId={currentUserId}
            sessionPending={sessionPending}
            sessionError={sessionError}
            participationUnavailable={participationUnavailable}
          />
          <section aria-label="Event host" className="rounded-xl border bg-card p-6">
            {renderHost(event.organizerId)}
          </section>
        </aside>
      </div>
    </div>
  )
}
