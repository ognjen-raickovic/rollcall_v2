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
  const navigate = useNavigate()
  const location = useLocation()
  const attending = currentUserId !== null && event.attendeeIds.includes(currentUserId)
  const isOrganizer = currentUserId === event.organizerId
  const started = Date.parse(event.startsAt) <= Date.now()
  const unavailable = event.status !== 'scheduled' || started
  const full = event.attendeeIds.length >= event.capacity
  const pending = join.isPending || leave.isPending
  const error = join.error ?? leave.error

  function handleAttendance() {
    if (currentUserId === null) {
      void navigate(loginPath(`${location.pathname}${location.search}${location.hash}`))
      return
    }
    join.reset()
    leave.reset()
    const variables = { id: event.id, actor: { userId: currentUserId } }
    if (attending) leave.mutate(variables)
    else join.mutate(variables)
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <p className="flex items-center gap-2 font-semibold">
        <Users className="size-5 text-primary" aria-hidden="true" />
        {isOrganizer
          ? 'You’re organizing this event'
          : attending
            ? 'You’re on the guest list'
            : 'There’s a place for you at the table'}
      </p>
      <p className="text-sm text-muted-foreground">
        {event.status === 'cancelled'
          ? 'This event has been canceled.'
          : started
            ? 'This event has already started.'
            : `${event.capacity - event.attendeeIds.length} of ${event.capacity} player seats available.`}
      </p>
      {sessionError && (
        <p role="status" className="text-sm text-muted-foreground">
          Your session couldn’t be restored. Log in again to join.
        </p>
      )}
      {isOrganizer ? (
        <Button asChild variant="outline">
          <Link to={`/events/${event.id}/edit`}>Edit event placeholder</Link>
        </Button>
      ) : (
        <Button
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
          {sessionPending
            ? 'Checking session...'
            : pending
              ? attending
                ? 'Leaving...'
                : 'Joining...'
              : unavailable
                ? 'Attendance closed'
                : full && !attending
                  ? 'Event full'
                  : attending
                    ? 'Leave event'
                    : currentUserId === null
                      ? 'Log in to join'
                      : 'Join event'}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
    </div>
  )
}
