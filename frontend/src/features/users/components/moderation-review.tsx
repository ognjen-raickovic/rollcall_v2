import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { REPORT_REASON_LABELS } from '@/lib/report-reasons'
import { useReportDetail, useModerationDecision } from '../api/use-moderation'

export function ModerationReview({ id }: { id: string }) {
  const detail = useReportDetail(id),
    decision = useModerationDecision(),
    [action, setAction] = useState<'dismiss' | 'take-action' | null>(null),
    [note, setNote] = useState(''),
    [notice, setNotice] = useState('')
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const node = dialog.current
    if (action) {
      node?.showModal()
      cancel.current?.focus()
    } else node?.close()
    return () => node?.close()
  }, [action])
  if (detail.isPending) return <p role="status">Loading report details…</p>
  if (detail.error)
    return (
      <div role="alert" className="space-y-3">
        <p>{detail.error.message}</p>
        <Button variant="outline" onClick={() => void detail.refetch()}>
          Retry report details
        </Button>
      </div>
    )
  const report = detail.data
  if (!report) return null
  return (
    <section className="space-y-5 rounded-xl border bg-card p-6" aria-labelledby="report-review-title">
      <h2 id="report-review-title" className="break-words text-xl font-bold">
        Review: {report.eventContext.title}
      </h2>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold">Reason</dt>
          <dd>{REPORT_REASON_LABELS[report.reason]}</dd>
        </div>
        <div>
          <dt className="font-semibold">Report status</dt>
          <dd className="capitalize">{report.status}</dd>
        </div>
        <div>
          <dt className="font-semibold">Event</dt>
          <dd>
            {report.eventContext.game} · {report.eventContext.visibility}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Scheduled start</dt>
          <dd>{new Date(report.eventContext.startsAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-semibold">Current event status</dt>
          <dd className="capitalize">{report.eventAvailable ? report.eventStatus : 'Deleted by host'}</dd>
        </div>
      </dl>
      <div className="space-y-2">
        <h3 className="font-semibold">Submitted details</h3>
        <p className="whitespace-pre-wrap break-words text-sm">
          {report.description || 'No additional details were provided.'}
        </p>
      </div>
      {report.status === 'open' && (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={decision.isPending}
            onClick={() => {
              decision.reset()
              setNote('')
              setAction('dismiss')
            }}
          >
            Dismiss report
          </Button>
          <Button
            disabled={decision.isPending || !report.eventAvailable}
            onClick={() => {
              decision.reset()
              setNote('')
              setAction('take-action')
            }}
          >
            Cancel reported event
          </Button>
        </div>
      )}
      {!report.eventAvailable && report.status === 'open' && (
        <p className="text-sm text-muted-foreground">
          The event was deleted. You can dismiss this report; its snapshot and audit history are preserved.
        </p>
      )}
      {decision.isPending && <p role="status">Saving moderation decision…</p>}
      {decision.error && (
        <p role="alert" className="text-sm text-destructive">
          {decision.error.message}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="space-y-3">
        <h3 className="font-semibold">Moderation history</h3>
        {report.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No moderation decisions yet.</p>
        ) : (
          <ul className="space-y-3">
            {report.history.map((entry) => (
              <li key={entry.id} className="space-y-1 border-t pt-3 text-sm">
                <p className="font-semibold">
                  {entry.action === 'dismiss' ? 'Report dismissed' : 'Reported event cancelled'}
                </p>
                <p className="break-words">{entry.explanation}</p>
                <p className="break-all text-xs text-muted-foreground">
                  Moderator: {entry.actorId} · {new Date(entry.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <dialog
        ref={dialog}
        aria-labelledby="moderation-confirm-title"
        className="m-auto w-[calc(100%-2rem)] max-w-lg space-y-4 rounded-xl border bg-card p-6 text-foreground backdrop:bg-background/80"
        onCancel={(event) => {
          event.preventDefault()
          setAction(null)
        }}
      >
        <h2 id="moderation-confirm-title" className="text-2xl font-bold">
          {action === 'dismiss' ? 'Dismiss this report?' : 'Cancel the reported event?'}
        </h2>
        <p className="text-sm">
          {action === 'dismiss'
            ? 'This closes the report without changing the event.'
            : 'Cancellation blocks new joins and cannot be undone by the host. Existing memberships remain.'}
        </p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!action || decision.isPending) return
            const chosen = action
            decision.mutate(
              { id, action: chosen, note },
              {
                onSuccess: () => {
                  setNotice(
                    chosen === 'dismiss' ? 'Report dismissed.' : 'Event cancelled and report actioned.',
                  )
                  setNote('')
                },
              },
            )
            setAction(null)
          }}
        >
          <div className="space-y-2">
            <label htmlFor="moderation-note" className="text-sm font-semibold">
              Internal reason (5–500 characters)
            </label>
            <Input
              id="moderation-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              minLength={5}
              maxLength={500}
              required
              aria-describedby="moderation-note-help"
            />
            <p id="moderation-note-help" className="text-xs text-muted-foreground">
              Recorded in the private audit. Do not include addresses, room codes or unnecessary personal
              details.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button ref={cancel} type="button" variant="outline" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button disabled={decision.isPending}>
              Confirm {action === 'dismiss' ? 'dismissal' : 'cancellation'}
            </Button>
          </div>
        </form>
      </dialog>
    </section>
  )
}
