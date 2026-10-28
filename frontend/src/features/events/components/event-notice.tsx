import { ActionFeedback } from '@/components/action-feedback'
import { useRouteFeedback } from '@/lib/use-route-feedback'

export function EventNotice() {
  const state = useRouteFeedback('eventNotice')
  const notice = typeof state === 'string' && state.length <= 300 ? state : null
  if (!notice) return null
  return <ActionFeedback message={notice} />
}
