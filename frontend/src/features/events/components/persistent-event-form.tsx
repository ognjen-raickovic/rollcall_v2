import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { loginPath } from '@/lib/auth-navigation'
import type { HostEventDetails } from '../api/event-write-dtos'
import type { EventActionSession } from '../api/persistent-event-actions-api'
import { usePersistentEventForm } from '../hooks/use-persistent-event-form'
import { EventFormView } from './event-form-view'
import type { EventLocationSlotProps } from './event-form-view'
import { EventCoverInput } from './event-cover-input'
import { EventFormField } from './event-form-field'
import { usePersistentEventCover } from '../api/use-persistent-event-covers'
import { eventCover } from '../api/event-covers'
import { Button } from '@/components/ui/button'

type PersistentEventFormProps = {
  event?: HostEventDetails
  session: EventActionSession
  games: { id: number; name: string; category: string }[]
  renderLocation: (props: EventLocationSlotProps) => ReactNode
}

export function PersistentEventForm({ event, session, games, renderLocation }: PersistentEventFormProps) {
  const controller = usePersistentEventForm({ event, session, games })
  const location = useLocation()
  const currentEvent = controller.savedEvent ?? event
  const currentCover = currentEvent?.cover
  const access = usePersistentEventCover(
    currentEvent?.id ?? '',
    currentCover?.kind === 'custom' ? currentCover.version : '',
    session,
    currentCover?.kind === 'custom' && controller.coverDraft === undefined,
  )
  const gameId = controller.form.watch('gameId')
  const fallback = eventCover(games.find((game) => game.id === gameId)?.category)
  const existingImage =
    !access.error && access.data && Date.parse(access.data.expiresAt) > Date.now()
      ? access.data.imageUrl
      : null
  const preview = controller.coverDraft === undefined ? existingImage : controller.coverDraft
  return (
    <EventFormView
      {...controller}
      editing={Boolean(event)}
      status={event?.status}
      participantCount={event?.participantCount}
      hostName={event?.host.displayName ?? 'your account'}
      games={games}
      renderLocation={renderLocation}
      cancelTo={currentEvent ? `/events/${currentEvent.id}` : '/events'}
      customCovers={false}
      submitLabel={controller.partialSavedId ? 'Save changes' : undefined}
      coverControl={
        <EventFormField
          name="persistent-cover"
          label="Event cover image"
          error={controller.imageError ?? undefined}
          help="Optional. JPG, PNG, or WebP, up to 3 MB. Your image is saved securely after the event details."
        >
          {(attributes) => (
            <>
              <EventCoverInput
                {...attributes}
                inputRef={null}
                value={preview}
                fallback={fallback}
                pending={controller.pending}
                processing={controller.imagePending}
                onChange={(value) => {
                  controller.setCoverDraft(value)
                  controller.setImageError(null)
                }}
                onPendingChange={controller.setImagePending}
                onError={controller.setImageError}
              />
              {currentCover?.kind === 'custom' && controller.coverDraft === undefined && !existingImage && (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p role={access.error ? 'alert' : 'status'}>
                    {access.error
                      ? 'The current cover could not be displayed. It will stay saved unless you replace or remove it.'
                      : 'Loading your saved cover...'}
                  </p>
                  {access.error && (
                    <Button type="button" variant="outline" size="sm" onClick={() => void access.refetch()}>
                      Retry cover preview
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={controller.pending}
                    onClick={() => {
                      controller.setCoverDraft(null)
                      controller.setImageError(null)
                    }}
                  >
                    Remove saved custom cover
                  </Button>
                </div>
              )}
              {controller.coverPending && (
                <p role="status" className="text-sm text-muted-foreground">
                  Saving your cover image...
                </p>
              )}
            </>
          )}
        </EventFormField>
      }
      saveNotice={
        controller.partialSavedId ? (
          <div className="space-y-3 rounded-lg border bg-accent p-4 text-sm text-accent-foreground">
            <p>
              Your event details are saved. Retrying the cover will use this event and will not create another
              one.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={controller.pending}
                onClick={() => void controller.retryCover()}
              >
                Retry cover
              </Button>
              <Link className="text-primary underline" to={`/events/${controller.partialSavedId}`}>
                View saved event
              </Link>
            </div>
          </div>
        ) : undefined
      }
      loginLink={
        controller.requiresLogin ? (
          <Link className="text-primary underline" to={loginPath(`${location.pathname}${location.search}`)}>
            Log in again to continue
          </Link>
        ) : undefined
      }
    />
  )
}
