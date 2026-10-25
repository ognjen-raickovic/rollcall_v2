import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

type DeleteEventDialogProps = {
  open: boolean
  pending: boolean
  error: Error | null
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteEventDialog({ open, pending, error, onCancel, onConfirm }: DeleteEventDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      cancel.current?.focus()
    } else if (!open && element.open) element.close()
    return () => {
      if (element.open) element.close()
    }
  }, [open])
  return (
    <dialog
      ref={dialog}
      aria-labelledby="delete-event-title"
      aria-describedby="delete-event-description"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg space-y-6 overflow-y-auto rounded-xl border bg-card p-6 text-foreground backdrop:bg-background/80"
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onCancel()
      }}
    >
      <h2 id="delete-event-title" className="text-2xl font-bold">
        Delete Event?
      </h2>
      <p id="delete-event-description" className="leading-relaxed text-muted-foreground">
        This permanently removes the event and all of its participation records. This cannot be undone.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message} The event has not been confirmed deleted. You can retry or cancel.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button ref={cancel} variant="outline" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" disabled={pending} onClick={onConfirm}>
          {pending ? 'Deleting...' : 'Delete Event'}
        </Button>
      </div>
    </dialog>
  )
}
