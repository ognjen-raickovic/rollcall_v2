import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useSuspensionAudit } from '../api/use-account-status'
type SuspensionHistoryProps = { viewer: string; target: string }
export function SuspensionHistory({ viewer, target }: SuspensionHistoryProps) {
  const [before, setBefore] = useState<string | null>(null),
    audit = useSuspensionAudit(viewer, target, before, true)
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Account access history</h3>
      {audit.isPending && <p role="status">Loading access history…</p>}
      {audit.error && (
        <div role="alert">
          <p>{audit.error.message}</p>
          <Button variant="outline" onClick={() => void audit.refetch()}>
            Retry history
          </Button>
        </div>
      )}
      {!audit.isError && audit.data && (
        <>
          <ul className="space-y-3">
            {audit.data.items.map((entry) => (
              <li key={entry.id} className="space-y-1 border-t pt-3 text-sm">
                <p className="font-semibold capitalize">
                  {entry.previousStatus} → {entry.newStatus}
                </p>
                <p className="break-words">{entry.reason}</p>
                <p className="break-all text-xs text-muted-foreground">
                  Moderator: {entry.actorId} · {new Date(entry.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
          {audit.data.items.length === 0 && (
            <p className="text-sm text-muted-foreground">No suspension history for this account.</p>
          )}
          <div className="flex gap-3">
            {before && (
              <Button variant="outline" onClick={() => setBefore(null)}>
                Latest entries
              </Button>
            )}
            {audit.data.nextCursor && (
              <Button variant="outline" onClick={() => setBefore(audit.data.nextCursor)}>
                Older entries
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
