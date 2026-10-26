import { useRef, useState } from 'react'
import type { EventCover } from '../api/event-dtos'
import type { EventActionSession } from '../api/event-write-dtos'
import { usePersistentEventCover, anonymousCoverSession } from '../api/use-persistent-event-covers'
import { EventImage } from './event-image'

type PersistentEventImageProps = {
  eventId: string
  cover: EventCover
  title: string
  category?: string
  className?: string
  priority?: boolean
  session?: EventActionSession
  enabled?: boolean
}

export function PersistentEventImage({
  eventId,
  cover,
  session = anonymousCoverSession,
  enabled = true,
  ...image
}: PersistentEventImageProps) {
  const result = usePersistentEventCover(
    eventId,
    cover.kind === 'custom' ? cover.version : '',
    session,
    enabled && cover.kind === 'custom',
  )
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const lastRefresh = useRef(0)
  const access =
    enabled && !result.error && result.data && Date.parse(result.data.expiresAt) > Date.now()
      ? result.data
      : null
  const source = access && failedUrl !== access.imageUrl ? access.imageUrl : cover.imageUrl
  return (
    <EventImage
      {...image}
      src={source}
      onSourceError={() => {
        if (!access) return
        setFailedUrl(access.imageUrl)
        // One fresh capability may recover expiration or a transient object read. An
        // unavailable object must not cause an unbounded error/refetch loop.
        if (Date.now() - lastRefresh.current < 30000) return
        lastRefresh.current = Date.now()
        void result.refetch()
      }}
    />
  )
}
