import { Check, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { HttpError } from '@/lib/http-client'
import { ActionFeedback } from '@/components/action-feedback'
import type { EventDetails } from '../api/event-dtos'
import { EventAuthPrompt } from './event-auth-prompt'

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
  const [prompt, setPrompt] = useState(false),
    [confirmLeave, setConfirmLeave] = useState(false)
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
            ? "You're hosting this event"
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
        <Button
          className="w-full"
          variant="outline"
          disabled={pending || closed}
          onClick={() => (event.visibility === 'private' ? setConfirmLeave(true) : onLeave())}
        >
          {pending ? 'Updating attendance...' : 'Leave Event'}
        </Button>
      ) : !event.viewer.userId && !closed && !full ? (
        <Button className="w-full" onClick={() => setPrompt(true)}>
          Join event
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
      {confirmLeave && !closed && event.viewer.hasJoined && (
        <div className="space-y-3 text-sm">
          <p>Leaving removes access to this private event. You will need a valid room code to rejoin.</p>
          <div className="grid grid-cols-2 gap-3">
            <Button disabled={pending} onClick={onLeave}>
              Confirm leave
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setConfirmLeave(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <EventAuthPrompt open={prompt} onOpenChange={setPrompt} eventId={event.id} />
      {feedback && <ActionFeedback message={feedback} />}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error instanceof HttpError && error.code === 'AGE_REQUIREMENT_NOT_MET'
            ? `This event requires players to be at least ${event.minimumAge} years old on its start date.`
            : error.message}
        </p>
      )}
      {error instanceof HttpError && error.code === 'AGE_INFORMATION_REQUIRED' && (
        <Link to="/account" className="text-sm text-primary underline">
          Review account information
        </Link>
      )}
      {error instanceof HttpError && error.status === 401 && (
        <Link className="text-sm text-primary underline" to={loginTo}>
          Log in again to continue
        </Link>
      )}
      <p className="text-sm leading-relaxed text-muted-foreground">
        Player seats exclude the host. Experience is a recommendation, not verified skill. Minimum age is
        checked for new joins using your self-declared private date of birth; it is not independent age
        verification.
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {event.minimumAge === 0 ? 'All ages welcome' : `For players aged ${event.minimumAge}+`}
        {event.price > 0 ? ' · Pay at the venue; no online payment.' : ' · No payment required.'}
      </p>
    </div>
  )
}
