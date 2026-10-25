import { ArrowLeft, Gamepad2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { HttpError } from '@/lib/http-client'
import { loginPath } from '@/lib/auth-navigation'

import { isEventId } from '../api/event-dtos'
import { usePersistentEvent } from '../api/use-persistent-events'
import { EventDetailsView } from './event-details-view'
import { EventParticipationSummary } from './event-participation-summary'
import { DeleteEventDialog } from './delete-event-dialog'
import { EventNotice } from './event-notice'
import {
  usePersistentDeleteEvent,
  usePersistentJoinEvent,
  usePersistentLeaveEvent,
} from '../api/use-persistent-event-actions'

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
  const navigate = useNavigate()
  const mounted = useRef(true)
  const acting = useRef(false)
  const [feedback, setFeedback] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const session = { viewerId, getAccessToken }
  const join = usePersistentJoinEvent(session)
  const leave = usePersistentLeaveEvent(session)
  const remove = usePersistentDeleteEvent(session)
  const result = usePersistentEvent(
    eventId,
    viewerId,
    getAccessToken,
    validId && sessionReady && !sessionError,
  )
  async function deleteEvent() {
    if (acting.current || !isEventId(eventId)) return
    acting.current = true
    try {
      await remove.mutateAsync(eventId)
      await getAccessToken()
      if (!mounted.current) return
      setDeleteOpen(false)
      await navigate('/events', { replace: true, state: { eventNotice: 'Your event has been deleted.' } })
    } catch {
      /* Keep the confirmation open and show the mutation error. */
    } finally {
      acting.current = false
    }
  }
  const deleteDialog = (
    <DeleteEventDialog
      open={deleteOpen}
      pending={remove.isPending}
      error={remove.error}
      onCancel={() => {
        setDeleteOpen(false)
        remove.reset()
      }}
      onConfirm={() => void deleteEvent()}
    />
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
        {deleteDialog}
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
        {feedback && <p role="status">{feedback}</p>}
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
        {deleteDialog}
      </section>
    )
  }
  const authorized =
    viewerId !== null && event.viewer.userId === viewerId && (event.viewer.isHost || event.viewer.hasJoined)
  const address =
    authorized && !leave.isPending && !leave.isSuccess && !leave.error && 'address' in event
      ? event.address
      : undefined
  const pending = join.isPending || leave.isPending || remove.isPending
  const currentEvent = event
  async function participate(leaving: boolean) {
    if (acting.current) return
    acting.current = true
    setFeedback('')
    if (!leaving) leave.reset()
    else join.reset()
    try {
      if (leaving) await leave.mutateAsync(currentEvent.id)
      else await join.mutateAsync(currentEvent.id)
      await getAccessToken()
      if (!mounted.current) return
      if (leaving && currentEvent.visibility === 'private') {
        await navigate('/events', {
          replace: true,
          state: { eventNotice: 'You have left the private event.' },
        })
        return
      }
      setFeedback(leaving ? 'You have left this event.' : 'You have joined this event.')
    } catch {
      /* Mutation hooks expose sanitized errors without changing confirmed state. */
    } finally {
      acting.current = false
    }
  }
  return (
    <>
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
        notice={<EventNotice />}
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
        attendance={
          <EventParticipationSummary
            event={event}
            pending={pending}
            error={join.error ?? leave.error}
            feedback={feedback}
            loginTo={loginPath(`${location.pathname}${location.search}`)}
            onJoin={() => void participate(false)}
            onLeave={() => void participate(true)}
            onDelete={() => {
              remove.reset()
              setDeleteOpen(true)
            }}
          />
        }
      />
      {deleteDialog}
    </>
  )
}
