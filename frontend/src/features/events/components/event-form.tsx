import { ArrowLeft, CalendarDays, Dices, LoaderCircle, LockKeyhole, MapPin, Tag, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { useEventForm } from '../hooks/use-event-form'
import type { Event } from '../types'
import { EventFormField } from './event-form-field'

type EventFormProps = {
  event?: Event
  currentUserId: number
  hostName?: string
  games: { id: number; name: string; category: string }[]
}

export function EventForm({ event, currentUserId, hostName, games }: EventFormProps) {
  const { form, submit, pending } = useEventForm({ event, currentUserId, games })
  const {
    register,
    formState: { errors },
  } = form
  const navigate = useNavigate()
  const visibility = form.watch('visibility')
  const cancelTo = event ? `/events/${event.id}` : '/events'
  const inputStyle = 'h-11 bg-background'
  const selectStyle =
    'h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive'

  return (
    <div className="space-y-8 py-4">
      <Link
        to={cancelTo}
        className="inline-flex min-h-10 items-center gap-2 text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {event ? 'Back to event' : 'Back to discovery'}
      </Link>
      <header className="max-w-2xl space-y-4">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">Make room for one more</p>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          {event ? 'Edit your event' : 'Bring your table together'}
        </h1>
        <p className="leading-relaxed text-muted-foreground">
          {event
            ? 'Keep your players in the loop. Update the details of your next game night.'
            : 'A great game night starts with a good invitation. Tell players what’s happening, where to meet, and who should join.'}
        </p>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-3">
        <form
          noValidate
          onSubmit={submit}
          aria-label={event ? 'Edit event' : 'Create event'}
          aria-busy={pending}
          className="min-w-0 space-y-6 lg:col-span-2"
        >
          <p className="text-xs text-muted-foreground">
            Fields marked with * are required. Dates and times use{' '}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}.
          </p>
          {Object.keys(errors).length > 0 && (
            <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-card p-4">
              <p className="font-semibold">
                {errors.root?.server?.message ?? 'Check the highlighted fields before continuing.'}
              </p>
              <p className="text-sm text-muted-foreground">
                Your entered details are still here. Correct the fields below and try again.
              </p>
            </div>
          )}
          {event?.status === 'cancelled' && (
            <p role="status" className="rounded-lg border bg-accent p-4 text-sm text-accent-foreground">
              This event is canceled. Saving edits keeps it canceled.
            </p>
          )}
          <fieldset disabled={pending} className="min-w-0 space-y-6 disabled:opacity-70">
            <section
              aria-labelledby="form-basics"
              className="min-w-0 space-y-6 rounded-xl border bg-card p-4 md:p-6"
            >
              <h2 id="form-basics" className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                <Dices className="size-5 text-primary" aria-hidden="true" /> The basics
              </h2>
              <EventFormField
                name="title"
                label="Event title"
                required
                error={errors.title?.message}
                help="3–100 characters. Make your game night easy to recognize."
              >
                {(attributes) => (
                  <Input
                    {...register('title')}
                    {...attributes}
                    required
                    maxLength={100}
                    placeholder="e.g. Casual Commander night in Podgorica"
                    className={inputStyle}
                  />
                )}
              </EventFormField>
              <EventFormField
                name="description"
                label="Description"
                required
                error={errors.description?.message}
                help="10–5000 characters. Include the format, what to bring, and anything new players should know."
              >
                {(attributes) => (
                  <Textarea
                    {...register('description')}
                    {...attributes}
                    required
                    maxLength={5000}
                    rows={5}
                    placeholder="What will your players be doing?"
                    className="min-h-36 bg-background"
                  />
                )}
              </EventFormField>
              <EventFormField name="gameId" label="Game" required error={errors.gameId?.message}>
                {(attributes) => (
                  <select
                    {...register('gameId', { valueAsNumber: true })}
                    {...attributes}
                    required
                    className={selectStyle}
                  >
                    <option value="0">Choose a game</option>
                    {games.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.name}
                      </option>
                    ))}
                  </select>
                )}
              </EventFormField>
            </section>
            <section
              aria-labelledby="form-location"
              className="min-w-0 space-y-6 rounded-xl border bg-card p-4 md:p-6"
            >
              <h2
                id="form-location"
                className="flex items-center gap-3 text-2xl font-semibold tracking-tight"
              >
                <MapPin className="size-5 text-primary" aria-hidden="true" /> Where &amp; when
              </h2>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <EventFormField name="city" label="City" required error={errors.city?.message}>
                  {(attributes) => (
                    <Input
                      {...register('city')}
                      {...attributes}
                      required
                      maxLength={80}
                      placeholder="e.g. Podgorica"
                      className={inputStyle}
                    />
                  )}
                </EventFormField>
                <EventFormField
                  name="venue"
                  label="Venue or meeting point"
                  required
                  error={errors.venue?.message}
                >
                  {(attributes) => (
                    <Input
                      {...register('venue')}
                      {...attributes}
                      required
                      maxLength={120}
                      placeholder="e.g. The Gathering Table"
                      className={inputStyle}
                    />
                  )}
                </EventFormField>
              </div>
              <EventFormField name="address" label="Address" required error={errors.address?.message}>
                {(attributes) => (
                  <Input
                    {...register('address')}
                    {...attributes}
                    required
                    maxLength={200}
                    placeholder="Street and number"
                    className={inputStyle}
                  />
                )}
              </EventFormField>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <EventFormField
                  name="startsAt"
                  label="Start date and time"
                  required
                  error={errors.startsAt?.message}
                  help="Choose a time in the future."
                >
                  {(attributes) => (
                    <Input
                      {...register('startsAt')}
                      {...attributes}
                      required
                      type="datetime-local"
                      step="60"
                      className={`${inputStyle} min-w-0`}
                    />
                  )}
                </EventFormField>
                <EventFormField
                  name="endsAt"
                  label="End date and time"
                  required
                  error={errors.endsAt?.message}
                  help="The end must be after the start."
                >
                  {(attributes) => (
                    <Input
                      {...register('endsAt')}
                      {...attributes}
                      required
                      type="datetime-local"
                      step="60"
                      className={`${inputStyle} min-w-0`}
                    />
                  )}
                </EventFormField>
              </div>
            </section>
            <section
              aria-labelledby="form-players"
              className="min-w-0 space-y-6 rounded-xl border bg-card p-4 md:p-6"
            >
              <h2 id="form-players" className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                <Users className="size-5 text-primary" aria-hidden="true" /> Your players
              </h2>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <EventFormField
                  name="capacity"
                  label="Maximum participants"
                  required
                  error={errors.capacity?.message}
                  help={`1–100 player seats, excluding you as host.${event?.attendeeIds.length ? ` ${event.attendeeIds.length} seats are already taken.` : ''}`}
                >
                  {(attributes) => (
                    <Input
                      {...register('capacity', { valueAsNumber: true })}
                      {...attributes}
                      required
                      type="number"
                      min={Math.max(1, event?.attendeeIds.length ?? 0)}
                      max={100}
                      step="1"
                      className={inputStyle}
                    />
                  )}
                </EventFormField>
                <EventFormField
                  name="minimumAge"
                  label="Minimum age"
                  required
                  error={errors.minimumAge?.message}
                  help="0 means all ages. Age guidance is shown to players."
                >
                  {(attributes) => (
                    <Input
                      {...register('minimumAge', { valueAsNumber: true })}
                      {...attributes}
                      required
                      type="number"
                      min={0}
                      max={99}
                      step="1"
                      className={inputStyle}
                    />
                  )}
                </EventFormField>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <EventFormField
                  name="experienceLevel"
                  label="Experience level"
                  required
                  error={errors.experienceLevel?.message}
                >
                  {(attributes) => (
                    <select {...register('experienceLevel')} {...attributes} required className={selectStyle}>
                      <option value="all-levels">All experience levels</option>
                      <option value="beginner">Beginner friendly</option>
                      <option value="experienced">Experienced players</option>
                    </select>
                  )}
                </EventFormField>
                <EventFormField
                  name="price"
                  label="Entry price (EUR)"
                  required
                  error={errors.price?.message}
                  help="0 for free. Any payment is handled at the venue."
                >
                  {(attributes) => (
                    <Input
                      {...register('price', { valueAsNumber: true })}
                      {...attributes}
                      required
                      type="number"
                      min={0}
                      max={10000}
                      step="0.01"
                      className={inputStyle}
                    />
                  )}
                </EventFormField>
              </div>
            </section>
            <section
              aria-labelledby="form-discovery"
              className="min-w-0 space-y-6 rounded-xl border bg-card p-4 md:p-6"
            >
              <h2
                id="form-discovery"
                className="flex items-center gap-3 text-2xl font-semibold tracking-tight"
              >
                <Tag className="size-5 text-primary" aria-hidden="true" /> Make it yours
              </h2>
              <EventFormField
                name="tags"
                label="Tags"
                error={errors.tags?.message}
                help="Optional. Up to 6 comma-separated tags, 2–30 characters each, with no duplicates."
              >
                {(attributes) => (
                  <Input
                    {...register('tags')}
                    {...attributes}
                    placeholder="Beginner friendly, Casual play, Bring a deck"
                    className={inputStyle}
                  />
                )}
              </EventFormField>
              <EventFormField
                name="visibility"
                label="Visibility"
                required
                error={errors.visibility?.message}
                help={
                  visibility === 'private'
                    ? 'Only you and current participants can view this event. New players cannot join. No invitations are sent.'
                    : visibility === 'unlisted'
                      ? 'Hidden from discovery. Anyone with the link can view and join available seats.'
                      : 'Listed in public discovery when it is scheduled and upcoming.'
                }
              >
                {(attributes) => (
                  <select {...register('visibility')} {...attributes} required className={selectStyle}>
                    <option value="public">Public — discoverable by everyone</option>
                    <option value="private">Private — host and current players only</option>
                    <option value="unlisted">Unlisted — accessible by link</option>
                  </select>
                )}
              </EventFormField>
            </section>
          </fieldset>
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between md:p-6">
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              {event
                ? 'Saving updates this event for your players.'
                : 'You’ll be the host. A cover illustration is selected from your game.'}
            </p>
            <div className="flex shrink-0 gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void navigate(cancelTo)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {pending ? 'Saving...' : event ? 'Save changes' : 'Create Event'}
              </Button>
            </div>
          </div>
        </form>
        <aside aria-label="Hosting tips" className="space-y-6 lg:sticky lg:top-8">
          <div className="space-y-4 rounded-xl border border-primary/30 bg-card p-6">
            <CalendarDays className="size-6 text-primary" aria-hidden="true" />
            <p className="font-semibold">A good invitation goes a long way.</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Be clear about the game, who it’s for, and what players need to bring. Leave a little room for
              first-timers.
            </p>
            <p className="border-t pt-4 text-sm text-muted-foreground">
              Hosting as{' '}
              <span className="font-medium text-foreground">{hostName ?? 'your demo profile'}</span>.
            </p>
          </div>
          <div className="space-y-3 rounded-xl border bg-card p-6">
            <LockKeyhole className="size-5 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold">You’re in control of your table.</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Only you can edit your event. Player seats exclude the host, and capacity cannot go below
              current attendance.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
