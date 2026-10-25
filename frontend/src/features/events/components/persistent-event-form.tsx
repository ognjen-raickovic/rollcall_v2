import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { loginPath } from '@/lib/auth-navigation'
import type { HostEventDetails } from '../api/event-write-dtos'
import type { EventActionSession } from '../api/persistent-event-actions-api'
import { usePersistentEventForm } from '../hooks/use-persistent-event-form'
import { EventFormView } from './event-form-view'
import type { EventLocationSlotProps } from './event-form-view'

type PersistentEventFormProps = {
  event?: HostEventDetails
  session: EventActionSession
  games: { id: number; name: string; category: string }[]
  renderLocation: (props: EventLocationSlotProps) => ReactNode
}

export function PersistentEventForm({ event, session, games, renderLocation }: PersistentEventFormProps) {
  const controller = usePersistentEventForm({ event, session, games })
  const location = useLocation()
  return (
    <EventFormView
      {...controller}
      editing={Boolean(event)}
      status={event?.status}
      participantCount={event?.participantCount}
      hostName={event?.host.displayName ?? 'your account'}
      games={games}
      renderLocation={renderLocation}
      cancelTo={event ? `/events/${event.id}` : '/events'}
      customCovers={false}
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
