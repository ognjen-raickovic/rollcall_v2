import { CheckCircle2 } from 'lucide-react'

type ActionFeedbackProps = { message: string }

export function ActionFeedback({ message }: ActionFeedbackProps) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-primary/30 bg-accent p-4 text-sm leading-relaxed text-accent-foreground"
    >
      <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  )
}
