import { Check, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { EventDetails } from '../api/event-dtos'

type EventParticipationSummaryProps = { event: EventDetails }

export function EventParticipationSummary({ event }: EventParticipationSummaryProps) {
  const full = event.availableSlots === 0
  const closed = event.status !== 'scheduled' || Date.parse(event.startsAt) <= Date.now()
  return (
    <div className="space-y-6 rounded-xl border border-primary/30 bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-2xl font-bold">
          {event.price === 0
            ? 'Free entry'
            : new Intl.NumberFormat('en-GB', { style: 'currency', currency: event.currency }).format(
                event.price,
              )}
        </p>
        {full && (
          <span className="rounded-md border border-primary/40 bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
            Full
          </span>
        )}
      </div>
      <div className="space-y-3">
        <p className="flex items-center gap-2 font-semibold">
          <Users className="size-5 text-primary" aria-hidden="true" />
          {event.viewer.isHost
            ? 'You’re hosting this table'
            : event.viewer.hasJoined
              ? 'You’re on the guest list'
              : closed
                ? 'Attendance closed'
                : full
                  ? 'Every seat is taken'
                  : `${event.availableSlots} ${event.availableSlots === 1 ? 'seat' : 'seats'} available`}
        </p>
        <p className="text-sm text-muted-foreground">
          {event.participantCount} of {event.capacity} player seats filled
        </p>
        <progress
          aria-label="Player seats filled"
          value={event.participantCount}
          max={event.capacity}
          className="h-2 w-full appearance-none overflow-hidden rounded-full bg-secondary [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-primary"
        />
        {event.viewer.hasJoined && (
          <p className="flex items-center gap-2 text-sm text-primary">
            <Check className="size-4" aria-hidden="true" /> Your participation is confirmed.
          </p>
        )}
      </div>
      <Button className="w-full" variant="outline" disabled>
        {event.viewer.isHost
          ? 'Event editing coming soon'
          : event.viewer.hasJoined
            ? 'Leaving events coming soon'
            : 'Joining events coming soon'}
      </Button>
      <p className="text-sm leading-relaxed text-muted-foreground">
        This event is saved in RollCall. Event actions are not connected yet; hosting, editing and
        participation controls will be available in the next update.
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {event.minimumAge === 0 ? 'All ages welcome' : `For players aged ${event.minimumAge}+`}
        {event.price > 0 ? ' · Pay at the venue; no online payment.' : ' · No payment required.'}
      </p>
    </div>
  )
}
