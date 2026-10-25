import { Link } from 'react-router'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/mock-db'

import { useEvent } from '../api/use-events'
import { EventForm } from './event-form'
import type { EventLocationSlotProps } from './event-form'

type EventEditorProps = {
  mode: 'create' | 'edit'
  eventId?: string
  currentUserId: number | null
  hostName?: string
  games?: { id: number; name: string; category: string }[]
  gamesPending: boolean
  gamesError: boolean
  retryGames: () => void
  renderLocation: (props: EventLocationSlotProps) => ReactNode
}

export function EventEditor({
  mode,
  eventId,
  currentUserId,
  hostName,
  games = [],
  gamesPending,
  gamesError,
  retryGames,
  renderLocation,
}: EventEditorProps) {
  const editing = mode === 'edit'
  const id = Number(eventId)
  const validId = /^\d+$/.test(eventId ?? '') && Number.isSafeInteger(id) && id > 0
  const result = useEvent(editing && validId ? id : 0, currentUserId)

  if (currentUserId === null) return <p role="status">Checking your session...</p>
  if (editing && !validId)
    return (
      <section className="space-y-4 py-8">
        <h1 className="text-3xl font-bold">Invalid event ID</h1>
        <p className="text-muted-foreground">Choose an event you host to edit it.</p>
        <Button asChild variant="outline">
          <Link to="/demo/events">Browse demo events</Link>
        </Button>
      </section>
    )
  if (editing && result.isPending)
    return (
      <section role="status" aria-label="Loading event editor" className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </section>
    )
  if (editing && (result.error || !result.data))
    return (
      <section className="space-y-4 rounded-xl border bg-card p-8">
        <h1 className="text-3xl font-bold">
          {result.error instanceof ApiError && result.error.code === 'NOT_FOUND'
            ? 'Event not found'
            : 'Event unavailable'}
        </h1>
        <p role="alert" className="text-muted-foreground">
          {result.error instanceof ApiError && result.error.code === 'FORBIDDEN'
            ? 'This event is private. Only its host can edit it.'
            : 'We couldn’t open this event. It may have been removed, or your session may not have access.'}
        </p>
        <Button variant="outline" onClick={() => void result.refetch()}>
          Try again
        </Button>
        <Button asChild variant="ghost">
          <Link to="/demo/events">Back to demo events</Link>
        </Button>
      </section>
    )
  if (editing && result.data?.organizerId !== currentUserId)
    return (
      <section className="space-y-4 rounded-xl border bg-card p-8">
        <h1 className="text-3xl font-bold">Only the host can edit this event</h1>
        <p role="alert" className="text-muted-foreground">
          You’re signed in as a different player. Your changes cannot be submitted.
        </p>
        <Button asChild variant="outline">
          <Link to={`/demo/events/${id}`}>View demo event</Link>
        </Button>
      </section>
    )
  if (gamesPending)
    return (
      <section role="status" aria-label="Loading game catalog" className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64" />
        <p className="text-sm text-muted-foreground">Loading games for your event...</p>
      </section>
    )
  if (gamesError)
    return (
      <section className="space-y-4 rounded-xl border bg-card p-8">
        <h1 className="text-3xl font-bold">The game catalog couldn’t be loaded</h1>
        <p role="alert" className="text-muted-foreground">
          Please try again before creating or editing your event.
        </p>
        <Button variant="outline" onClick={retryGames}>
          Try again
        </Button>
      </section>
    )
  if (!games.length)
    return (
      <section className="space-y-4 rounded-xl border bg-card p-8">
        <h1 className="text-3xl font-bold">No games are available yet</h1>
        <p role="status" className="text-muted-foreground">
          Events need a game from the catalog. Check again soon.
        </p>
        <Button variant="outline" onClick={retryGames}>
          Check again
        </Button>
        <Button asChild variant="ghost">
          <Link to="/demo/events">Browse demo events</Link>
        </Button>
      </section>
    )

  return (
    <EventForm
      key={`${mode}-${eventId ?? 'new'}-${currentUserId}`}
      event={editing ? result.data : undefined}
      currentUserId={currentUserId}
      hostName={hostName}
      games={games}
      renderLocation={renderLocation}
    />
  )
}
