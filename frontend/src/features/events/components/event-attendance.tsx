import { useState } from 'react'
import { Check, LoaderCircle, LogIn, Users } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { loginPath } from '@/lib/auth-navigation'

import { useJoinEvent, useLeaveEvent } from '../api/use-events'
import type { Event } from '../types'

type EventAttendanceProps = {
  event: Event
  currentUserId: number | null
  sessionPending: boolean
  sessionError: boolean
}

export function EventAttendance({
  event,
  currentUserId,
  sessionPending,
  sessionError,
}: EventAttendanceProps) {
  const join = useJoinEvent()
  const leave = useLeaveEvent()
  const [feedback, setFeedback] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const attending = currentUserId !== null && event.attendeeIds.includes(currentUserId)
  const isOrganizer = currentUserId === event.organizerId
  const started = Date.parse(event.startsAt) <= Date.now()
  const unavailable = event.status !== 'scheduled' || started
  const seats = event.capacity - event.attendeeIds.length
  const full = seats === 0
  const pending = join.isPending || leave.isPending
  const error = join.error ?? leave.error

  function handleAttendance() {
    if (pending || unavailable || (full && !attending)) return
    if (currentUserId === null) {
      void navigate(loginPath(`${location.pathname}${location.search}${location.hash}`))
      return
    }
    setFeedback('')
    join.reset()
    leave.reset()
    const variables = { id: event.id, actor: { userId: currentUserId } }
    if (attending)
      leave.mutate(variables, {
        onSuccess: () => {
          if (event.visibility === 'private')
            void navigate('/events', {
              replace: true,
              state: { eventNotice: 'You’ve left the private event.' },
            })
          else setFeedback('You’ve left the event. Your seat is available for another player.')
        },
      })
    else
      join.mutate(variables, {
        onSuccess: () => setFeedback('You’re in! Your player seat is reserved for this demo session.'),
      })
  }

  const actionLabel = sessionPending
    ? 'Checking session...'
    : join.isPending
      ? 'Joining...'
      : leave.isPending
        ? 'Leaving...'
        : unavailable
          ? 'Attendance closed'
          : full && !attending
            ? 'Event full'
            : attending
              ? 'Leave Event'
              : currentUserId === null
                ? 'Log in to join'
                : 'Join Event'

  return (
    <div className="space-y-6 rounded-xl border border-primary/30 bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-2xl font-bold">
          {event.price === 0
            ? 'Free entry'
            : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(event.price)}
        </p>
        {full && (
          <span className="rounded-md border border-primary/40 bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
            Full
          </span>
        )}
      </div>
      <div className="space-y-3">
        <p className="flex items-center gap-2 font-semibold">
          <Users className="size-5 text-primary" aria-hidden="true" />
          {isOrganizer
            ? 'You’re hosting this table'
            : attending
              ? 'You’re on the guest list'
              : full
                ? 'Every seat is taken'
                : `${seats} ${seats === 1 ? 'seat' : 'seats'} available`}
        </p>
        <p className="text-sm text-muted-foreground">
          {event.attendeeIds.length} of {event.capacity} player seats filled
        </p>
        <progress
          aria-label="Player seats filled"
          value={event.attendeeIds.length}
          max={event.capacity}
          className="h-2 w-full overflow-hidden rounded-full border-0 bg-secondary accent-primary [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
        />
      </div>
      {event.status === 'cancelled' ? (
        <p role="status" className="rounded-lg bg-accent p-4 text-sm text-accent-foreground">
          This event has been canceled. Joining and leaving are closed.
        </p>
      ) : started ? (
        <p role="status" className="text-sm text-muted-foreground">
          This event has already started. Attendance is closed.
        </p>
      ) : full && !attending && !isOrganizer ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          This table is full. Check back later in case someone releases a seat.
        </p>
      ) : null}
      {sessionError && (
        <p role="status" className="text-sm text-muted-foreground">
          Your session couldn’t be restored. Log in again to join.
        </p>
      )}
      {isOrganizer ? (
        <Button asChild variant="outline" className="w-full">
          <Link to={`/events/${event.id}/edit`}>Edit Event</Link>
        </Button>
      ) : (
        <Button
          className="w-full"
          size="lg"
          onClick={handleAttendance}
          disabled={sessionPending || pending || unavailable || (full && !attending)}
          variant={attending ? 'outline' : 'default'}
        >
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : attending ? (
            <Check aria-hidden="true" />
          ) : currentUserId === null ? (
            <LogIn aria-hidden="true" />
          ) : null}
          {actionLabel}
        </Button>
      )}
      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg bg-accent p-4 text-sm leading-relaxed text-accent-foreground"
        >
          {feedback}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm leading-relaxed text-destructive">
          {error.message} Please check the latest availability and try again.
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {event.minimumAge === 0 ? 'All ages welcome' : `For players aged ${event.minimumAge}+`}
        {event.price > 0 ? ' · Pay at the venue; no online payment.' : ' · No payment required.'}
      </p>
    </div>
  )
}
