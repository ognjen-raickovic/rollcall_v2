import type { EventSummary, MyEventSummary } from '../api/event-dtos'
import type { EventBrowseSession } from '../api/event-viewer-api'
import { anonymousEventSession } from '../api/event-viewer-api'
import { useEventViewerStatus } from '../api/use-event-viewer-status'
import { EventCard } from './event-card'
import { EventCardActions } from './event-card-actions'
import { useEffect, useState } from 'react'
import { ActionFeedback } from '@/components/action-feedback'

type EventCardsProps = {
  events: (EventSummary | MyEventSummary)[]
  session?: EventBrowseSession
  preview?: boolean
  className?: string
}
export function EventCards({
  events,
  session = anonymousEventSession,
  preview = false,
  className = 'grid gap-6 md:grid-cols-2 lg:grid-cols-3',
}: EventCardsProps) {
  const [feedback, setFeedback] = useState<{ viewerId: string | null; message: string } | null>(null)
  useEffect(() => setFeedback(null), [session.viewerId])
  const status = useEventViewerStatus(
    events.map((event) => event.id),
    session,
  )
  const verified =
    session.ready !== false && !session.error && Boolean(session.viewerId) && !status.error
  return (
    <div className="space-y-4">
      {feedback?.message && feedback.viewerId === session.viewerId && !session.error && (
        <ActionFeedback message={feedback.message} />
      )}
      <ul className={className}>
        {events.map((event) => (
          <li key={event.id}>
            <EventCard
              event={event}
              session={session}
              preview={preview}
              action={
                <EventCardActions
                  key={`${session.viewerId ?? 'guest'}:${session.signedIn ?? false}:${event.id}`}
                  event={event}
                  session={session}
                  viewer={verified ? status.data?.find((item) => item.eventId === event.id) : undefined}
                  checking={session.ready === false || Boolean(session.viewerId && status.isPending)}
                  verificationError={Boolean(
                    session.viewerId &&
                    (status.error ||
                      (!status.isPending && !status.data?.some((item) => item.eventId === event.id))),
                  )}
                  onFeedback={(message) => setFeedback({ viewerId: session.viewerId, message })}
                  retry={() => void status.refetch()}
                />
              }
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
