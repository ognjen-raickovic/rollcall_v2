import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { loginPath } from '@/lib/auth-navigation'
import { REPORT_REASONS, REPORT_REASON_LABELS } from '@/lib/report-reasons'
import type { EventActionSession } from '../api/event-write-dtos'
import { useReportEvent } from '../api/use-event-reports'

export function ReportEvent({ id, session }: { id: string; session: EventActionSession }) {
  const [params, setParams] = useSearchParams(),
    [open, setOpen] = useState(params.get('report') === '1'),
    [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>('inappropriate'),
    [description, setDescription] = useState(''),
    [notice, setNotice] = useState('')
  const mutation = useReportEvent(id, session),
    dialog = useRef<HTMLDialogElement>(null),
    select = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    const node = dialog.current
    if (open && session.viewerId) {
      node?.showModal()
      select.current?.focus()
    } else node?.close()
    return () => node?.close()
  }, [open, session.viewerId])
  function close() {
    if (mutation.isPending) return
    setOpen(false)
    setDescription('')
    mutation.reset()
    if (params.has('report'))
      setParams(
        (previous) => {
          previous.delete('report')
          return previous
        },
        { replace: true },
      )
  }
  return (
    <section className="my-6 rounded-xl border bg-card p-6 space-y-3" aria-label="Event safety">
      <p className="text-sm text-muted-foreground">
        Concerned about this event? Send a private report to the moderation team.
      </p>
      {session.viewerId ? (
        <Button
          variant="outline"
          onClick={() => {
            setNotice('')
            mutation.reset()
            setOpen(true)
          }}
        >
          Report Event
        </Button>
      ) : (
        <Button variant="outline" asChild>
          <Link to={loginPath(`/events/${id}?report=1`)}>Log in to report this event</Link>
        </Button>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="report-event-heading"
        className="m-auto w-[calc(100%-2rem)] max-w-lg space-y-4 rounded-xl border bg-card p-6 text-foreground backdrop:bg-background/80"
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
      >
        <h2 id="report-event-heading" className="text-2xl font-bold">
          Report this event
        </h2>
        <p className="text-sm text-muted-foreground">
          Reports are private to moderators. Do not include addresses, room codes or unnecessary personal
          information.
        </p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (mutation.isPending) return
            mutation.mutate(
              { reason, description },
              {
                onSuccess: () => {
                  setOpen(false)
                  setDescription('')
                  mutation.reset()
                  if (params.has('report'))
                    setParams(
                      (previous) => {
                        previous.delete('report')
                        return previous
                      },
                      { replace: true },
                    )
                },
              },
            )
          }}
        >
          <div className="space-y-2">
            <label htmlFor="report-event-reason" className="text-sm font-semibold">
              Reason
            </label>
            <select
              ref={select}
              id="report-event-reason"
              className="w-full rounded-md border bg-background p-2 text-foreground"
              value={reason}
              disabled={mutation.isPending}
              onChange={(event) => {
                const chosen = REPORT_REASONS.find((value) => value === event.target.value)
                if (chosen) setReason(chosen)
              }}
            >
              {REPORT_REASONS.map((value) => (
                <option key={value} value={value}>
                  {REPORT_REASON_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="report-event-description" className="text-sm font-semibold">
              Additional details (optional)
            </label>
            <Textarea
              id="report-event-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={1000}
              rows={4}
              disabled={mutation.isPending}
              aria-describedby="report-event-count"
            />
            <p id="report-event-count" className="text-xs text-muted-foreground">
              {description.length}/1000 characters. Plain text only.
            </p>
          </div>
          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" onClick={close} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button disabled={mutation.isPending}>
              {mutation.isPending ? 'Submitting…' : 'Submit report'}
            </Button>
          </div>
        </form>
      </dialog>
    </section>
  )
}
