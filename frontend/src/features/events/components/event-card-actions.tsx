import { useEffect, useRef, useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { HttpError } from '@/lib/http-client'
import type { EventSummary, MyEventSummary } from '../api/event-dtos'
import type { EventBrowseSession, EventViewerStatus } from '../api/event-viewer-api'
import { usePersistentJoinEvent, usePersistentLeaveEvent } from '../api/use-persistent-event-actions'
import { EventAuthPrompt } from './event-auth-prompt'

type EventCardActionsProps = {
  event: EventSummary | MyEventSummary
  session: EventBrowseSession
  viewer?: EventViewerStatus
  checking: boolean
  verificationError: boolean
  retry: () => void
  onFeedback: (message: string) => void
}

export function EventCardActions({
  event,
  session,
  viewer,
  checking,
  verificationError,
  retry,
  onFeedback,
}: EventCardActionsProps) {
  const join = usePersistentJoinEvent(session),
    leave = usePersistentLeaveEvent(session)
  const [prompt, setPrompt] = useState(false),
    [confirmLeave, setConfirmLeave] = useState(false)
  const acting = useRef(false),
    mounted = useRef(true),
    [, tick] = useState(0)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    function schedule() {
      const future = [event.startsAt, event.endsAt]
        .map((value) => Date.parse(value) - Date.now())
        .filter((value) => value >= 0)
      if (future.length)
        timer = setTimeout(
          () => {
            tick((value) => value + 1)
            schedule()
          },
          Math.min(Math.min(...future) + 1, 2147483647),
        )
    }
    schedule()
    return () => clearTimeout(timer)
  }, [event.startsAt, event.endsAt])
  const busy =
    useIsMutating({
      mutationKey: ['persistent-event-actions'],
      predicate: (mutation) => {
        const value = mutation.state.variables as
          { value?: unknown; session?: { viewerId?: string } } | undefined
        return value?.value === event.id && value.session?.viewerId === session.viewerId
      },
    }) > 0
  const closed = event.status === 'cancelled' || Date.parse(event.startsAt) <= Date.now()
  const label =
    event.status === 'cancelled'
      ? 'Cancelled'
      : Date.parse(event.endsAt) <= Date.now()
        ? 'Finished'
        : 'Closed'
  async function participate(leaving: boolean) {
    if (acting.current || busy) return
    acting.current = true
    onFeedback('')
    join.reset()
    leave.reset()
    try {
      if (leaving) await leave.mutateAsync(event.id)
      else await join.mutateAsync(event.id)
      await session.getAccessToken()
      onFeedback(leaving ? 'You have left this event.' : 'You have joined this event.')
      if (mounted.current) setConfirmLeave(false)
    } catch {
      /* Mutation hooks expose only sanitized errors. */
    } finally {
      acting.current = false
    }
  }
  const error = join.error ?? leave.error
  return (
    <div className="contents">
      <div className="col-start-2 flex min-h-9 min-w-0 items-center justify-end">
        {session.error || (session.signedIn && !session.viewerId) ? (
          <span className="text-xs text-muted-foreground">Account unavailable</span>
        ) : checking ? (
          <span role="status" className="text-xs text-muted-foreground">
            Checking participation...
          </span>
        ) : verificationError ? (
          <Button size="sm" variant="outline" onClick={retry}>
            Retry participation
          </Button>
        ) : viewer?.isHost ? (
          <Button size="sm" asChild>
            <Link to={`/events/${event.id}/edit`}>Manage event</Link>
          </Button>
        ) : closed ? (
          <span className="text-sm font-semibold text-muted-foreground">{label}</span>
        ) : viewer?.hasJoined ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              event.visibility === 'private' ? setConfirmLeave(true) : void participate(true)
            }
          >
            {busy ? 'Updating...' : 'Leave event'}
          </Button>
        ) : event.availableSlots === 0 ? (
          <span className="text-sm font-semibold text-muted-foreground">Full</span>
        ) : event.visibility === 'private' ? (
          <span className="text-xs text-muted-foreground">Room code required</span>
        ) : (
          <Button
            size="sm"
            disabled={busy || session.ready === false}
            onClick={() => (session.viewerId ? void participate(false) : setPrompt(true))}
          >
            {busy ? 'Joining...' : 'Join event'}
          </Button>
        )}
      </div>
      <div className="col-span-2 min-w-0 space-y-3 empty:hidden">
        {confirmLeave && (
          <div className="space-y-3 text-sm">
            <p>Leaving removes access to this private event. A valid room code is required to rejoin.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => void participate(true)}>
                Confirm leave
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmLeave(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error instanceof HttpError &&
            error.code === 'AGE_REQUIREMENT_NOT_MET' &&
            event.minimumAge !== undefined
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
          <Button size="sm" variant="outline" onClick={() => setPrompt(true)}>
            Log in again
          </Button>
        )}
      </div>
      <EventAuthPrompt open={prompt} onOpenChange={setPrompt} eventId={event.id} />
    </div>
  )
}
