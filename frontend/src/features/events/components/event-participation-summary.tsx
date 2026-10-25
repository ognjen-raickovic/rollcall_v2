import { Check, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { HttpError } from '@/lib/http-client'
import type { EventDetails } from '../api/event-dtos'

type EventParticipationSummaryProps = {
  event: EventDetails
  pending: boolean
  error: Error | null
  feedback: string
  loginTo: string
  onJoin: () => void
  onLeave: () => void
  onDelete: () => void
}

export function EventParticipationSummary({
  event,
  pending,
  error,
  feedback,
  loginTo,
  onJoin,
  onLeave,
  onDelete,
}: EventParticipationSummaryProps) {
  const [, refreshStartBoundary] = useState(0)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    function scheduleBoundary() {
      const remaining = Date.parse(event.startsAt) - Date.now()
      if (remaining <= 0) refreshStartBoundary((version) => version + 1)
      else timer = setTimeout(scheduleBoundary, Math.min(remaining + 1, 2147483647))
    }
    scheduleBoundary()
    return () => clearTimeout(timer)
  }, [event.startsAt])
  const full = event.availableSlots === 0
  const closed = event.status !== 'scheduled' || Date.parse(event.startsAt) <= Date.now()
  return (
    <div className="space-y-6 rounded-xl border border-primary/30 bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-2xl font-bold">
          {event.price === 0
            ? 'Free entry'
            : new Intl.NumberFormat('en-GB', { style: 'currency', currency: event.currency }).format(
                event.price,
              )}
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
          {event.viewer.isHost
            ? 'You’re hosting this table'
            : event.viewer.hasJoined
              ? 'You’re on the guest list'
              : closed
                ? 'Attendance closed'
                : full
                  ? 'Every seat is taken'
                  : `${event.availableSlots} ${event.availableSlots === 1 ? 'seat' : 'seats'} available`}
        </p>
        <p className="text-sm text-muted-foreground">
          {event.participantCount} of {event.capacity} player seats filled
        </p>
        <progress
          aria-label="Player seats filled"
          value={event.participantCount}
          max={event.capacity}
          className="h-2 w-full appearance-none overflow-hidden rounded-full bg-secondary [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-primary"
        />
        {event.viewer.hasJoined && (
          <p className="flex items-center gap-2 text-sm text-primary">
            <Check className="size-4" aria-hidden="true" /> Your participation is confirmed.
          </p>
        )}
      </div>
      {event.viewer.isHost ? (
        <div className="space-y-3">
          <Button asChild className="w-full" variant="outline">
            <Link to={`/events/${event.id}/edit`}>Edit Event</Link>
          </Button>
          <Button className="w-full" variant="destructive" disabled={pending} onClick={onDelete}>
            Delete Event
          </Button>
        </div>
      ) : event.viewer.hasJoined ? (
        <Button className="w-full" variant="outline" disabled={pending || closed} onClick={onLeave}>
          {pending ? 'Updating attendance...' : 'Leave Event'}
        </Button>
      ) : !event.viewer.userId && !closed && !full ? (
        <Button asChild className="w-full">
          <Link to={loginTo}>Log in to join</Link>
        </Button>
      ) : (
        <Button
          className="w-full"
          disabled={pending || closed || full || event.visibility === 'private'}
          onClick={onJoin}
        >
          {pending
            ? 'Joining...'
            : closed
              ? 'Attendance closed'
              : full
                ? 'Event Full'
                : event.visibility === 'private'
                  ? 'Private event'
                  : 'Join Event'}
        </Button>
      )}
      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg bg-accent p-4 text-sm text-accent-foreground"
        >
          {feedback}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message} Check the latest event details and try again.
        </p>
      )}
      {error instanceof HttpError && error.status === 401 && (
        <Link className="text-sm text-primary underline" to={loginTo}>
          Log in again to continue
        </Link>
      )}
      <p className="text-sm leading-relaxed text-muted-foreground">
        Player seats exclude the host. Experience and minimum age are guidance, not verified eligibility.
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {event.minimumAge === 0 ? 'All ages welcome' : `For players aged ${event.minimumAge}+`}
        {event.price > 0 ? ' · Pay at the venue; no online payment.' : ' · No payment required.'}
      </p>
    </div>
  )
}
