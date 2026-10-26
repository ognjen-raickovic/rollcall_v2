import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { REPORT_REASON_LABELS } from '@/lib/report-reasons'
import { useReportQueue } from '../api/use-moderation'
import { ModerationReview } from './moderation-review'
import type { ReportCursor, ReportStatus } from '../api/moderation-api'

export function ModerationDashboard() {
  const [status, setStatus] = useState<ReportStatus>('open'),
    [cursor, setCursor] = useState<ReportCursor | null>(null),
    [selected, setSelected] = useState<string | null>(null)
  const queue = useReportQueue(status, cursor)
  return (
    <div className="space-y-6">
      <p className="max-w-prose text-muted-foreground">
        Review event reports using the limited context provided. Reporter identities, protected addresses,
        room codes and private covers are not included.
      </p>
      <div className="space-y-2">
        <label htmlFor="report-status" className="text-sm font-semibold">
          Report status
        </label>
        <select
          id="report-status"
          value={status}
          className="block w-full rounded-md border bg-background p-2 text-foreground sm:w-64"
          onChange={(event) => {
            setStatus(event.target.value as ReportStatus)
            setCursor(null)
            setSelected(null)
          }}
        >
          <option value="open">Open</option>
          <option value="dismissed">Dismissed</option>
          <option value="actioned">Actioned</option>
          <option value="all">All reports</option>
        </select>
      </div>
      {queue.isPending && <p role="status">Loading reports…</p>}
      {queue.error && (
        <div role="alert" className="space-y-3">
          <p>{queue.error.message}</p>
          <Button variant="outline" onClick={() => void queue.refetch()}>
            Retry reports
          </Button>
        </div>
      )}
      {!queue.isError && queue.data && (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {queue.data.items.map((report) => (
              <li key={report.id}>
                <button
                  className="h-full w-full rounded-xl border bg-card p-5 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => setSelected(report.id)}
                  aria-pressed={selected === report.id}
                >
                  <h2 className="break-words text-xl font-semibold">{report.eventContext.title}</h2>
                  <p className="mt-2 text-sm">{REPORT_REASON_LABELS[report.reason]}</p>
                  <p className="mt-2 text-sm capitalize text-muted-foreground">
                    {report.status} · {new Date(report.createdAt).toLocaleString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {queue.data.items.length === 0 && <p>No {status === 'all' ? '' : `${status} `}reports found.</p>}
          <div className="flex gap-3">
            {cursor && (
              <Button
                variant="outline"
                onClick={() => {
                  setCursor(null)
                  setSelected(null)
                }}
              >
                Latest reports
              </Button>
            )}
            {queue.data.nextCursor && (
              <Button
                variant="outline"
                onClick={() => {
                  setCursor(queue.data.nextCursor)
                  setSelected(null)
                }}
              >
                Older reports
              </Button>
            )}
          </div>
        </>
      )}
      {selected && !queue.isError && <ModerationReview key={selected} id={selected} />}
    </div>
  )
}
