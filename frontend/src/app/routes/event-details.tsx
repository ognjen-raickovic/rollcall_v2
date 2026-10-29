import { useParams, useOutletContext, useNavigate } from 'react-router'
import { EventPreviewDialog } from '@/features/events/components/event-preview-dialog'

import { EventDetails } from '@/features/events/components/event-details'
import { useApiSession } from '@/features/users/api/use-auth'

export function EventDetailsRoute() {
  const { eventId } = useParams()
  const session = useApiSession()
  const { preview, focusId, scrollY } = useOutletContext<{
    preview: boolean
    focusId: string | null
    scrollY: number
  }>()
  const navigate = useNavigate()
  const details = (
    <EventDetails
      key={`${eventId ?? 'invalid'}-${session.viewerId ?? 'guest'}`}
      eventId={eventId}
      viewerId={session.viewerId}
      getAccessToken={session.getAccessToken}
      sessionReady={session.ready}
      sessionError={session.error}
      preview={preview}
    />
  )
  return preview ? (
    <EventPreviewDialog focusId={focusId} scrollY={scrollY} onClose={() => void navigate(-1)}>
      {details}
    </EventPreviewDialog>
  ) : (
    details
  )
}
