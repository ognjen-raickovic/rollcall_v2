import type { ReactNode } from 'react'
import { useEventForm } from '../hooks/use-event-form'
import type { Event } from '../types'
import { EventFormView } from './event-form-view'
import type { EventLocationSlotProps } from './event-form-view'

export type { EventLocationSlotProps } from './event-form-view'

type EventFormProps = {
  event?: Event
  currentUserId: number
  hostName?: string
  games: { id: number; name: string; category: string }[]
  renderLocation: (props: EventLocationSlotProps) => ReactNode
}

export function EventForm({ event, currentUserId, hostName, games, renderLocation }: EventFormProps) {
  const controller = useEventForm({ event, currentUserId, games })
  return (
    <EventFormView
      {...controller}
      editing={Boolean(event)}
      status={event?.status}
      participantCount={event?.attendeeIds.length}
      hostName={hostName}
      games={games}
      renderLocation={renderLocation}
      cancelTo={event ? `/demo/events/${event.id}` : '/demo/events'}
      legacyCity={!event?.location && controller.form.watch('city') === event?.city ? event?.city : undefined}
      customCovers
    />
  )
}
