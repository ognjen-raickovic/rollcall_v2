import { ArrowLeft, Gamepad2 } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { HttpError } from '@/lib/http-client'
import { loginPath } from '@/lib/auth-navigation'

import { isEventId } from '../api/event-dtos'
import { usePersistentEvent } from '../api/use-persistent-events'
import { EventDetailsView } from './event-details-view'
import { EventParticipationSummary } from './event-participation-summary'

type EventDetailsProps = {
  eventId: string | undefined
  viewerId: string | null
  getAccessToken: () => Promise<string | null>
  sessionReady: boolean
  sessionError: Error | null
}

export function EventDetails({
  eventId,
  viewerId,
  getAccessToken,
  sessionReady,
  sessionError,
}: EventDetailsProps) {
  const validId = isEventId(eventId)
  const location = useLocation()
  const result = usePersistentEvent(
    eventId,
    viewerId,
    getAccessToken,
    validId && sessionReady && !sessionError,
  )
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
  if (!sessionError && (!sessionReady || result.isPending))
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
  const error = sessionError ?? result.error
  // Do not render cached protected data during a failed session check or refetch.
  const event = !error && sessionReady ? result.data : undefined
  if (!event) {
    const status = error instanceof HttpError ? error.status : null
    const missing = status === 404
    const unauthorized = status === 401 || Boolean(sessionError)
    const forbidden = status === 403
    return (
      <section className="space-y-4 rounded-xl border bg-card p-8">
        <h1 className="text-3xl font-bold">
          {missing
            ? 'Event not found'
            : unauthorized
              ? 'Log in to continue'
              : forbidden
                ? 'Event unavailable'
                : status === 400
                  ? 'Invalid event request'
                  : 'Event could not be loaded'}
        </h1>
        <p role="alert" className="text-muted-foreground">
          {missing
            ? 'This event is unavailable or the link is incorrect. Explore the upcoming public tables instead.'
            : unauthorized
              ? 'Your session could not be verified. Log in again to view this event.'
              : forbidden
                ? 'Your account cannot view this event.'
                : 'Please check your connection and try again in a moment.'}
        </p>
        {unauthorized && (
          <Button asChild>
            <Link to={loginPath(`${location.pathname}${location.search}`)}>Log in</Link>
          </Button>
        )}
        {!missing && !forbidden && !unauthorized && (
          <Button variant="outline" onClick={() => void result.refetch()}>
            Try again
          </Button>
        )}
        <div>{backLink}</div>
      </section>
    )
  }
  const authorized =
    viewerId !== null && event.viewer.userId === viewerId && (event.viewer.isHost || event.viewer.hasJoined)
  const address = authorized && 'address' in event ? event.address : undefined
  return (
    <EventDetailsView
      event={{
        ...event,
        cityName: event.city.name,
        countryName: event.country.name,
        administrativeDivision: event.city.administrativeDivision,
        address,
        imageUrl: event.cover.imageUrl,
      }}
      backLink={backLink}
      game={
        <div className="flex items-center gap-3">
          <Gamepad2 className="size-8 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-semibold">{event.game.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{event.game.category.replaceAll('-', ' ')}</p>
          </div>
        </div>
      }
      host={
        <>
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Your host</p>
          <Link
            to={`/users/${event.host.id}`}
            className="mt-2 inline-block font-semibold text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
          >
            {event.host.displayName}
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">Bringing this table together.</p>
        </>
      }
      attendance={<EventParticipationSummary event={event} />}
    />
  )
}
