import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { notify, notifyFailure } from '@/lib/notifications'
import type { EventActionSession } from '../api/event-write-dtos'
import { useInvitations } from '../api/use-invitations'

export function InvitationPanel({ id, session }: { id: string; session: EventActionSession }) {
  const control = useInvitations(session),
    [confirm, setConfirm] = useState<'rotate' | 'revoke' | null>(null)
  const value = control.invitation
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    confirming = useRef(false),
    mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    const node = dialog.current
    if (confirm) {
      node?.showModal()
      cancel.current?.focus()
    } else node?.close()
    return () => node?.close()
  }, [confirm])
  return (
    <section className="mt-6 space-y-4 rounded-xl border bg-card p-6" aria-labelledby="invitation-heading">
      <h2 id="invitation-heading" className="text-2xl font-bold">
        Private room code
      </h2>
      <p className="text-sm text-muted-foreground">
        Sharing a valid code lets its recipient join and view the private event, including its exact address.
        Rotation or revocation blocks future joins without removing existing players.
      </p>
      {value && (
        <div className="space-y-2">
          <p role="status">{value.code ? 'Active' : value.revokedAt ? 'Revoked' : 'Expired'}</p>
          {value.code && (
            <output
              className="block break-all rounded-lg bg-secondary p-4 font-mono text-xl"
              aria-label="Room code"
            >
              {value.code}
            </output>
          )}
          {value.expiresAt && (
            <p className="text-sm text-muted-foreground">
              Expires {new Date(value.expiresAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
      {control.error && (
        <p role="alert" className="text-sm text-destructive">
          {control.error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={control.pending}
          onClick={() => {
            if (value) control.hide()
            else void control.manage(id, 'reveal')
          }}
        >
          {value ? 'Hide code' : 'Reveal code'}
        </Button>
        {value?.code && (
          <Button
            variant="outline"
            disabled={control.pending}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value.code ?? '')
                if (mounted.current) notify('invitation.copied')
              } catch (error) {
                if (mounted.current) notifyFailure(error)
              }
            }}
          >
            Copy code
          </Button>
        )}
        <Button variant="outline" disabled={control.pending} onClick={() => setConfirm('rotate')}>
          Regenerate code
        </Button>
        <Button variant="outline" disabled={control.pending} onClick={() => setConfirm('revoke')}>
          Revoke code
        </Button>
      </div>
      {control.pending && <p role="status">Updating invitation...</p>}
      <dialog
        ref={dialog}
        aria-labelledby="invitation-confirm-title"
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg space-y-6 overflow-y-auto rounded-xl border bg-card p-6 text-foreground backdrop:bg-background/80"
        onCancel={(event) => {
          event.preventDefault()
          if (!confirming.current) setConfirm(null)
        }}
      >
        <h2 id="invitation-confirm-title" className="text-2xl font-bold">
          Confirm invitation change
        </h2>
        <p>The old code will stop accepting new players. Existing participants will stay.</p>
        <div className="grid grid-cols-2 gap-3">
          <Button
            disabled={control.pending}
            className="h-auto min-h-11 whitespace-normal"
            onClick={async () => {
              if (!confirm || confirming.current) return
              confirming.current = true
              try {
                if (await control.manage(id, confirm)) setConfirm(null)
              } finally {
                confirming.current = false
              }
            }}
          >
            Confirm {confirm === 'rotate' ? 'regeneration' : 'revocation'}
          </Button>
          <Button ref={cancel} disabled={control.pending} variant="outline" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
        </div>
      </dialog>
    </section>
  )
}
