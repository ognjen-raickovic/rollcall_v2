import { HttpError } from './http-client'

// Only fixed copy can reach the global surface: never payloads, server text or codes.
const messages = {
  'comment.posted': 'Comment posted',
  'reply.posted': 'Reply posted',
  'comment.updated': 'Comment updated',
  'comment.deleted': 'Comment deleted',
  'comment.hidden': 'Comment hidden',
  'review.posted': 'Review posted',
  'review.updated': 'Review updated',
  'review.deleted': 'Review deleted',
  'review.hidden': 'Review hidden',
  'event.created': 'Event created',
  'event.updated': 'Event updated',
  'event.deleted': 'Event deleted',
  'event.joined': 'You joined the event',
  'event.left': 'You left the event',
  'invitation.rotated': 'Invitation code regenerated',
  'invitation.revoked': 'Invitation code revoked',
  'invitation.copied': 'Code copied',
  'profile.updated': 'Profile updated',
  'settings.updated': 'Changes saved',
  'games.updated': 'Game experience updated',
  'report.sent': 'Report submitted',
  'report.existing': 'Your open report is already on file',
  'moderation.updated': 'Moderation decision saved',
  'role.updated': 'Account role updated',
  'account.updated': 'Account access updated',
  'cover.updated': 'Event picture updated',
  'cover.partial': 'Event saved. Retry the picture upload.',
  'action.failed': 'Action could not be completed',
} as const
export type NoticeKey = keyof typeof messages
export type NoticeVariant = 'success' | 'error' | 'info' | 'warning'
export type Notice = { id: number; title: string; variant: NoticeVariant; description?: string }
let notices: Notice[] = [],
  sequence = 0,
  last = '',
  lastAt = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())
export const notificationStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  snapshot: () => notices,
  dismiss(id: number) {
    notices = notices.filter((notice) => notice.id !== id)
    emit()
  },
  clear() {
    notices = []
    last = ''
    lastAt = 0
    emit()
  },
}
export function notify(
  key: NoticeKey,
  variant: NoticeVariant = 'success',
  description?: 'validation' | 'access' | 'conflict' | 'limited' | 'connection',
) {
  const descriptions = {
    validation: 'Check the highlighted fields and try again.',
    access: 'Your session or access changed. Sign in again or refresh this page.',
    conflict: 'The current state does not allow this action. Refresh and check the available actions.',
    limited: 'Too many attempts. Wait before trying again.',
    connection:
      'Check your connection and try again. A failed response may need verification before retrying.',
  }
  const signature = key + ':' + variant + ':' + description
  if (
    notices.some(
      (notice) =>
        notice.title === messages[key] &&
        notice.variant === variant &&
        notice.description === (description ? descriptions[description] : undefined),
    )
  )
    return
  if (signature === last && Date.now() - lastAt < 1500) return
  last = signature
  lastAt = Date.now()
  notices = [
    ...notices.slice(-1),
    {
      id: ++sequence,
      title: messages[key],
      variant,
      description: description ? descriptions[description] : undefined,
    },
  ]
  emit()
}
export function notifyFailure(error: unknown) {
  const status = error instanceof HttpError ? error.status : null
  notify(
    'action.failed',
    'error',
    status === 400
      ? 'validation'
      : status === 401 || status === 403
        ? 'access'
        : status === 404 || status === 409
          ? 'conflict'
          : status === 429
            ? 'limited'
            : 'connection',
  )
}
