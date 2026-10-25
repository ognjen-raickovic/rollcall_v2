import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/mock-db'
import { loginPath } from '@/lib/auth-navigation'

import { useEvent } from '../api/use-events'
import { EventAttendance } from './event-attendance'
import { EventDetailsView } from './event-details-view'
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

export function DemoEventDetails({
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
      to="/demo/events"
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
    return <Navigate to="/demo/events" replace state={{ eventNotice: 'You’ve left the private event.' }} />
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

  const canViewAddress =
    currentUserId !== null &&
    (event.organizerId === currentUserId || event.attendeeIds.includes(currentUserId))
  return (
    <EventDetailsView
      event={{
        ...event,
        cityName: event.location?.cityName ?? event.city,
        countryName: event.location?.countryName ?? 'Montenegro',
        administrativeDivision: event.location?.administrativeDivision ?? null,
        address: canViewAddress ? event.address : undefined,
        participantCount: event.attendeeIds.length,
      }}
      backLink={backLink}
      notice={
        <>
          <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            Development demo event. Changes remain in memory and reset on reload.
          </p>
          <EventNotice />
        </>
      }
      game={renderGame(event.gameId)}
      host={renderHost(event.organizerId)}
      attendance={
        <EventAttendance
          key={`${event.id}-${currentUserId ?? 'guest'}`}
          event={event}
          currentUserId={currentUserId}
          sessionPending={sessionPending}
          sessionError={sessionError}
          participationUnavailable={participationUnavailable}
        />
      }
    />
  )
}
