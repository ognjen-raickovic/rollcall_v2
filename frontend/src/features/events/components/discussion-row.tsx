import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DiscussionContext as Context, DiscussionItem } from '../api/discussion-api'
import { DiscussionEditor } from './discussion-editor'
import { DiscussionReplyForm } from './discussion-reply-form'
import { cn } from '@/lib/utils'

export function DiscussionRow({
  item,
  context,
  canReply,
  canModerate,
  renderReplies,
}: {
  item: DiscussionItem
  context: Context
  canReply: boolean
  canModerate: boolean
  renderReplies: () => ReactNode
}) {
  const [replies, setReplies] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const replyButton = useRef<HTMLButtonElement>(null)
  function closeReply() {
    setReplyOpen(false)
    requestAnimationFrame(() => replyButton.current?.focus({ preventScroll: true }))
  }
  const placeholder = item.deleted || item.hidden
  return (
    <li
      className={cn(
        'min-w-0 space-y-3 [overflow-wrap:anywhere]',
        item.parentId ? 'border-b py-4 last:border-0' : 'rounded-xl border bg-card p-4 md:p-6',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {item.author ? (
          <Link
            className="min-w-0 font-semibold [overflow-wrap:anywhere] hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
            to={`/users/${item.author.id}`}
          >
            {item.author.displayName}
          </Link>
        ) : (
          <span className="text-muted-foreground">Deleted account</span>
        )}
        {item.isHost && (
          <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-medium text-primary">Host</span>
        )}
        <time className="text-xs text-muted-foreground" dateTime={item.createdAt}>
          {new Date(item.createdAt).toLocaleString('en-GB')}
        </time>
        {item.editedAt && (
          <span className="text-xs text-muted-foreground">
            Edited <time dateTime={item.editedAt}>{new Date(item.editedAt).toLocaleString('en-GB')}</time>
          </span>
        )}
      </div>
      {!placeholder && item.rating != null && (
        <div className="flex gap-1 text-primary" role="img" aria-label={`${item.rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Star
              key={value}
              className={`size-4 ${value <= Number(item.rating) ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
          ))}
        </div>
      )}
      <p
        className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${placeholder ? 'italic text-muted-foreground' : ''}`}
      >
        {item.deleted
          ? 'This contribution was deleted.'
          : item.hidden
            ? 'This contribution was hidden by moderation.'
            : item.body}
      </p>
      <div className="flex flex-wrap gap-2">
        {canReply && !placeholder && item.parentId === null && (
          <Button
            ref={replyButton}
            size="sm"
            variant="ghost"
            aria-expanded={replyOpen}
            onClick={() => setReplyOpen(!replyOpen)}
          >
            Reply
          </Button>
        )}
        {item.canEdit && (
          <DiscussionEditor
            context={context}
            label="Edit"
            initial={{ operation: 'edit', id: item.id }}
            item={item}
          />
        )}
        {item.canDelete && (
          <DiscussionEditor context={context} label="Delete" initial={{ operation: 'delete', id: item.id }} />
        )}
        {canModerate && !placeholder && (
          <DiscussionEditor context={context} label="Hide" initial={{ operation: 'hide', id: item.id }} />
        )}
        {!!item.replyCount && (
          <Button size="sm" variant="ghost" aria-expanded={replies} onClick={() => setReplies(!replies)}>
            {replies ? 'Hide replies' : `Show replies (${item.replyCount})`}
          </Button>
        )}
      </div>
      {replyOpen && canReply && !placeholder && (
        <DiscussionReplyForm
          context={context}
          parentId={item.id}
          onCancel={closeReply}
          onPosted={() => {
            setReplies(true)
            closeReply()
          }}
        />
      )}
      {replies && <div className="border-l-2 border-primary/30 pl-3 md:pl-4">{renderReplies()}</div>}
    </li>
  )
}
