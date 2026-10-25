import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { HttpError } from '@/lib/http-client'
import { loginPath } from '@/lib/auth-navigation'
import { useLocation } from 'react-router'
import { isEventId } from '../api/event-dtos'
import { hostEventDetailsSchema } from '../api/event-write-dtos'
import type { EventActionSession } from '../api/persistent-event-actions-api'
import { usePersistentEvent } from '../api/use-persistent-events'
import { PersistentEventForm } from './persistent-event-form'
import type { EventLocationSlotProps } from './event-form-view'

type PersistentEventEditorProps = {
  mode: 'create' | 'edit'
  eventId?: string
  session: EventActionSession & { ready: boolean; error: Error | null }
  games?: { id: number; name: string; category: string }[]
  gamesPending: boolean
  gamesError: boolean
  retryGames: () => void
  renderLocation: (props: EventLocationSlotProps) => ReactNode
}

export function PersistentEventEditor({
  mode,
  eventId,
  session,
  games = [],
  gamesPending,
  gamesError,
  retryGames,
  renderLocation,
}: PersistentEventEditorProps) {
  const editing = mode === 'edit'
  const location = useLocation()
  const valid = isEventId(eventId)
  const result = usePersistentEvent(
    eventId,
    session.viewerId,
    session.getAccessToken,
    editing && valid && session.ready && !session.error,
  )
  if (editing && !valid)
    return (
      <section className="space-y-4 py-8">
        <h1 className="text-3xl font-bold">Invalid event ID</h1>
        <Link className="text-primary underline" to="/events">
          Explore events
        </Link>
      </section>
    )
  if (session.error)
    return (
      <section className="space-y-4 rounded-xl border bg-card p-8">
        <h1 className="text-3xl font-bold">Log in to continue</h1>
        <p role="alert" className="text-muted-foreground">
          Your session could not be verified.
        </p>
        <Button asChild>
          <Link to={loginPath(`${location.pathname}${location.search}`)}>Log in</Link>
        </Button>
      </section>
    )
  if (!session.ready || !session.viewerId) return <p role="status">Checking your account...</p>
  if (gamesPending || (editing && result.isPending))
    return (
      <section role="status" aria-label="Loading event editor" className="space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96" />
      </section>
    )
  if (gamesError || !games.length)
    return (
      <section className="space-y-4 rounded-xl border bg-card p-8">
        <h1 className="text-3xl font-bold">
          {gamesError ? 'The game catalog could not be loaded' : 'No games are available yet'}
        </h1>
        <p role={gamesError ? 'alert' : 'status'} className="text-muted-foreground">
          Events need a game from the catalog. Try again before saving.
        </p>
        <Button variant="outline" onClick={retryGames}>
          Try again
        </Button>
      </section>
    )
  const event = editing ? result.data : undefined
  const accessError = result.error instanceof HttpError && [401, 403, 404].includes(result.error.status)
  if (editing && (!event || accessError))
    return (
      <section className="space-y-4 rounded-xl border bg-card p-8">
        <h1 className="text-3xl font-bold">
          {result.error instanceof HttpError && result.error.status === 404
            ? 'Event not found'
            : 'Event could not be loaded'}
        </h1>
        <p role="alert" className="text-muted-foreground">
          This event is unavailable or your account cannot access it.
        </p>
        <Button variant="outline" onClick={() => void result.refetch()}>
          Try again
        </Button>
        <Link className="text-primary underline" to="/events">
          Explore events
        </Link>
      </section>
    )
  if (
    event &&
    (!event.viewer.isHost ||
      event.viewer.userId !== session.viewerId ||
      event.host.id !== session.viewerId ||
      !('address' in event))
  )
    return (
      <section className="space-y-4 rounded-xl border bg-card p-8">
        <h1 className="text-3xl font-bold">Only the host can edit this event</h1>
        <p role="alert" className="text-muted-foreground">
          Your account cannot change this event.
        </p>
        <Link className="text-primary underline" to={`/events/${event.id}`}>
          View event
        </Link>
      </section>
    )
  const hostResult = event ? hostEventDetailsSchema.safeParse(event) : undefined
  if (editing && !hostResult?.success)
    return (
      <section className="space-y-4 rounded-xl border bg-card p-8">
        <h1 className="text-3xl font-bold">The event editor is unavailable</h1>
        <p role="alert" className="text-muted-foreground">
          The host information could not be verified. Reload the event before editing.
        </p>
        <Button variant="outline" onClick={() => void result.refetch()}>
          Try again
        </Button>
      </section>
    )
  return (
    <PersistentEventForm
      key={`${session.viewerId}-${event?.id ?? 'new'}`}
      event={hostResult?.success ? hostResult.data : undefined}
      session={session}
      games={games}
      renderLocation={renderLocation}
    />
  )
}
