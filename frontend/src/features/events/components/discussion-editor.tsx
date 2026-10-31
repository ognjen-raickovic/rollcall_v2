import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useDiscussionChange } from '../api/use-discussion'
import type { DiscussionContext as Context, DiscussionChange, DiscussionItem } from '../api/discussion-api'

export function DiscussionEditor({
  context,
  label,
  initial,
  item,
}: {
  context: Context
  label: string
  initial: DiscussionChange
  item?: DiscussionItem
}) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState(item?.body ?? '')
  const [rating, setRating] = useState(item?.rating ?? 5)
  const [reason, setReason] = useState('')
  const mutation = useDiscussionChange(context.eventId, context.kind, context.session)
  const deleting = initial.operation === 'delete',
    hiding = initial.operation === 'hide'
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    titleId = useId(),
    descriptionId = useId(),
    fieldId = useId()
  useEffect(() => {
    const node = dialog.current
    if (open) node?.showModal()
    else if (node?.open) {
      node.close()
      trigger.current?.focus()
    }
    return () => {
      if (node?.open) node.close()
    }
  }, [open])
  return (
    <>
      <Button
        ref={trigger}
        size={initial.operation === 'create' && !initial.parentId ? 'default' : 'sm'}
        variant={initial.operation === 'create' && !initial.parentId ? 'default' : 'outline'}
        onClick={() => {
          mutation.reset()
          setBody(item?.body ?? '')
          setRating(item?.rating ?? 5)
          setReason('')
          setOpen(true)
        }}
      >
        {label}
      </Button>
      {mutation.isSuccess && !open && (
        <span role="status" className="ml-2 inline-block text-sm text-muted-foreground">
          Change saved.
        </span>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          event.preventDefault()
          if (!mutation.isPending) setOpen(false)
        }}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg space-y-6 overflow-y-auto rounded-xl border bg-card p-6 text-foreground backdrop:bg-background/80"
      >
        <h3 id={titleId} className="text-xl font-semibold">
          {label}
        </h3>
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {deleting
            ? 'Your text will be removed. A placeholder preserves the discussion.'
            : hiding
              ? 'Provide a reason. This action is recorded in the moderation history.'
              : 'Keep it respectful. Use plain text, up to 2,000 characters. Links are displayed as text.'}
        </p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const values = hiding
              ? { reason: reason.trim() }
              : deleting
                ? {}
                : context.kind === 'reviews'
                  ? { rating, body: body.trim() || null }
                  : { body: body.trim() }
            mutation.mutate({ ...initial, ...values }, { onSuccess: () => setOpen(false) })
          }}
        >
          {hiding ? (
            <div className="space-y-2 text-sm font-medium">
              <label htmlFor={fieldId}>Moderation reason</label>
              <textarea
                id={fieldId}
                className="mt-2 min-h-28 w-full rounded-md border bg-background p-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                value={reason}
                minLength={5}
                maxLength={500}
                required
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          ) : (
            !deleting && (
              <>
                {context.kind === 'reviews' && (
                  <div className="space-y-2 text-sm font-medium">
                    <label htmlFor={fieldId + '-rating'}>Rating</label>
                    <select
                      id={fieldId + '-rating'}
                      className="mt-2 h-11 w-full rounded-md border bg-background px-3"
                      value={rating}
                      onChange={(event) => setRating(Number(event.target.value))}
                    >
                      {[5, 4, 3, 2, 1].map((value) => (
                        <option key={value} value={value}>
                          {value} {value === 1 ? 'star' : 'stars'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-2 text-sm font-medium">
                  <label htmlFor={fieldId}>
                    {context.kind === 'reviews' ? 'Review (optional)' : 'Comment'}
                  </label>
                  <textarea
                    id={fieldId}
                    className="mt-2 min-h-32 w-full rounded-md border bg-background p-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    value={body}
                    required={context.kind === 'comments'}
                    maxLength={2000}
                    onChange={(event) => setBody(event.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{body.length}/2,000 characters</p>
              </>
            )
          )}
          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : deleting ? 'Delete' : hiding ? 'Hide content' : 'Save'}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  )
}
