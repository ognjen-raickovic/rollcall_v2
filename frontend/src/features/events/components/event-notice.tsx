import { CheckCircle2 } from 'lucide-react'
import { useLocation } from 'react-router'

export function EventNotice() {
  const state: unknown = useLocation().state
  const notice =
    state && typeof state === 'object' && 'eventNotice' in state && typeof state.eventNotice === 'string'
      ? state.eventNotice
      : null
  if (!notice) return null
  return (
    <p
      role="status"
      className="flex items-start gap-3 rounded-lg border border-primary/30 bg-accent p-4 text-sm leading-relaxed text-accent-foreground"
    >
      <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
      {notice}
    </p>
  )
}
