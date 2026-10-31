import { useState } from 'react'
import { Link } from 'react-router'
import { MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { loginPath } from '@/lib/auth-navigation'
import { useDiscussion } from '../api/use-discussion'
import type { DiscussionContext as Context } from '../api/discussion-api'
import { DiscussionEditor } from './discussion-editor'
import { DiscussionRow } from './discussion-row'

function DiscussionList({ context, parentId = null }: { context: Context; parentId?: string | null }) {
  const query = useDiscussion(context.eventId, context.kind, context.session, parentId)
  const [feedback, setFeedback] = useState(false)
  const first = query.data?.pages[0]
  if (query.isPending)
    return (
      <p role="status" className="py-6 text-muted-foreground">
        Loading {parentId ? 'replies' : context.kind}…
      </p>
    )
  if (query.error || !first)
    return (
      <div className="space-y-3 rounded-xl border p-6">
        <p role="alert">{query.error?.message ?? 'Discussion could not be loaded.'}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  const permissions = first.permissions
  const comments = context.kind === 'comments'
  const canWrite = comments ? permissions.canComment : permissions.canReview
  const items = query.data.pages.flatMap((page) => page.items)
  return (
    <div className="space-y-6">
      {!parentId && (
        <>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">
              {comments ? 'Talk around the table' : 'How was your game?'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {comments
                ? 'Ask a question or discuss the upcoming session with other players.'
                : 'Reviews use recorded participation, not verified physical attendance. Share your experience after the event.'}
            </p>
          </div>
          {permissions.cancelled ? (
            <p role="status" className="rounded-lg border bg-muted p-4 text-sm">
              This event was cancelled. New comments and reviews are closed.
            </p>
          ) : comments && !permissions.commentsOpen ? (
            <p role="status" className="rounded-lg border bg-muted p-4 text-sm">
              Comments are closed because this event has ended.
            </p>
          ) : !comments && !permissions.reviewsOpen ? (
            <p role="status" className="rounded-lg border bg-muted p-4 text-sm">
              Reviews become available after this event ends.
            </p>
          ) : null}
          {canWrite ? (
            <DiscussionEditor
              context={context}
              label={comments ? 'Write a comment' : 'Write a review'}
              initial={{ operation: 'create' }}
            />
          ) : !context.session.viewerId && (comments ? permissions.commentsOpen : permissions.reviewsOpen) ? (
            <Button asChild>
              <Link to={loginPath(`/events/${context.eventId}`)}>Log in to contribute</Link>
            </Button>
          ) : !comments && permissions.reviewsOpen ? (
            <p className="text-sm text-muted-foreground">
              {items.some((item) => item.author?.id === context.session.viewerId && !item.deleted)
                ? 'Your review is below. You can edit or delete it.'
                : 'Only recorded participants other than the host can submit a review. Each player can have one review per event.'}
            </p>
          ) : null}
          {(permissions.canModerateComments || permissions.canModerateReviews) && (
            <p className="text-xs text-muted-foreground">
              Moderation is available for content you can access. Hiding requires an audited reason.
            </p>
          )}
        </>
      )}
      {items.length ? (
        <ul
          className={parentId ? 'space-y-0' : 'space-y-4'}
          aria-label={parentId ? 'Replies' : comments ? 'Event comments' : 'Event reviews'}
        >
          {items.map((item) => (
            <DiscussionRow
              key={item.id}
              item={item}
              context={context}
              renderReplies={() => <DiscussionList context={context} parentId={item.id} />}
              canReply={permissions.canComment}
              canModerate={comments ? permissions.canModerateComments : permissions.canModerateReviews}
            />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          <MessageSquare className="mb-3 size-5" aria-hidden="true" />
          {parentId
            ? 'No replies yet.'
            : comments
              ? 'No comments yet. Start the conversation.'
              : 'No reviews yet.'}
        </div>
      )}
      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => {
            setFeedback(true)
            void query.fetchNextPage()
          }}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
      {feedback && (
        <span role="status" className="sr-only">
          {query.isFetchingNextPage ? 'Loading more contributions.' : 'More contributions loaded.'}
        </span>
      )}
    </div>
  )
}

export function EventDiscussion(props: Context) {
  return (
    <DiscussionList
      key={`${props.eventId}:${props.session.viewerId ?? 'guest'}:${props.kind}`}
      context={props}
    />
  )
}
