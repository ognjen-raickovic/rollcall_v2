import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { DiscussionContext } from '../api/discussion-api'
import { useDiscussionChange } from '../api/use-discussion'

type DiscussionReplyFormProps = {
  context: DiscussionContext
  parentId: string
  onCancel: () => void
  onPosted: () => void
}
export function DiscussionReplyForm({ context, parentId, onCancel, onPosted }: DiscussionReplyFormProps) {
  const [body, setBody] = useState(''),
    [invalid, setInvalid] = useState(false)
  const id = useId(),
    input = useRef<HTMLTextAreaElement>(null)
  const mutation = useDiscussionChange(context.eventId, 'comments', context.session)
  const busy = useRef(false)
  useEffect(() => {
    input.current?.focus({ preventScroll: true })
  }, [])
  return (
    <form
      aria-label="Write a reply"
      className="space-y-3 rounded-lg border border-primary/20 bg-muted/40 p-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          if (!mutation.isPending) onCancel()
        }
      }}
      onSubmit={(event) => {
        event.preventDefault()
        if (busy.current) return
        if (!body.trim()) {
          setInvalid(true)
          return
        }
        busy.current = true
        mutation.mutate(
          { operation: 'create', parentId, body: body.trim() },
          {
            onSuccess: onPosted,
            onSettled: () => {
              busy.current = false
            },
          },
        )
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        Reply
      </label>
      <Textarea
        ref={input}
        id={id}
        value={body}
        rows={3}
        className="min-h-20 resize-y bg-background"
        maxLength={2000}
        required
        disabled={mutation.isPending}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid || mutation.error ? id + '-error' : undefined}
        onChange={(event) => {
          setBody(event.target.value)
          setInvalid(false)
        }}
      />
      {(invalid || mutation.error) && (
        <p id={id + '-error'} role="alert" className="text-sm text-destructive">
          {invalid ? 'Write a reply before posting.' : mutation.error?.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? 'Posting…' : 'Post reply'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={mutation.isPending} onClick={onCancel}>
          Cancel
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{body.length}/2,000</span>
      </div>
    </form>
  )
}
