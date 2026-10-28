import type { ReactNode } from 'react'
import {
  CalendarDays,
  Clock3,
  Globe2,
  Link2,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  Tag,
  Users,
} from 'lucide-react'
import { EventImage } from './event-image'
import type { ExperienceLevel } from '../types'
import { EXPERIENCE_LABELS } from '../event-tags'
import { EventRequirementBadges } from './event-requirement-badges'

type EventDetailsPresentation = {
  title: string
  description: string
  startsAt: string
  endsAt: string
  experienceLevel: ExperienceLevel
  visibility: 'public' | 'private' | 'unlisted'
  status: 'scheduled' | 'cancelled'
  minimumAge: number
  venue: string | null
  cityName: string
  countryName: string
  administrativeDivision: string | null
  address?: string
  imageUrl: string | null
  tags: readonly string[]
  participantCount: number
  capacity: number
}

type EventDetailsViewProps = {
  event: EventDetailsPresentation
  backLink: ReactNode
  game: ReactNode
  host: ReactNode
  attendance: ReactNode
  notice?: ReactNode
  cover?: ReactNode
}

export function EventDetailsView({
  event,
  backLink,
  game,
  host,
  attendance,
  notice,
  cover,
}: EventDetailsViewProps) {
  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  const experience = EXPERIENCE_LABELS[event.experienceLevel]
  const visibility = { public: 'Public event', private: 'Private event', unlisted: 'Unlisted event' }[
    event.visibility
  ]
  const VisibilityIcon =
    event.visibility === 'public' ? Globe2 : event.visibility === 'private' ? LockKeyhole : Link2
  const countryName = event.countryName
  const cityName = event.cityName

  return (
    <div className="space-y-8">
      {backLink}
      {notice}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold tracking-wide text-primary uppercase">
          <span className="flex items-center gap-2">
            <MapPin className="size-4" aria-hidden="true" /> {cityName}, {countryName}
          </span>
          <span className="rounded-md bg-accent px-3 py-1 text-accent-foreground">{visibility}</span>
        </div>
        <h1 className="max-w-4xl text-3xl font-bold tracking-tight md:text-4xl">{event.title}</h1>
        <EventRequirementBadges experienceLevel={event.experienceLevel} minimumAge={event.minimumAge} />
        <p className="text-base text-muted-foreground">
          {start.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}{' '}
          {event.venue && <> · {event.venue}</>}
        </p>
      </header>
      {cover ?? (
        <EventImage
          src={event.imageUrl}
          title={event.title}
          priority
          className="aspect-[16/7] max-h-64 w-full rounded-xl border"
        />
      )}
      <div className="grid items-start gap-8 lg:grid-cols-3">
        <div className="order-2 min-w-0 space-y-8 lg:order-1 lg:col-span-2">
          <section aria-label="Game information" className="rounded-xl border bg-card p-6">
            {game}
          </section>
          <section aria-labelledby="about-event" className="space-y-4">
            <h2 id="about-event" className="text-2xl font-bold tracking-tight">
              About this game night
            </h2>
            <p className="max-w-prose whitespace-pre-line text-base leading-relaxed text-muted-foreground">
              {event.description}
            </p>
          </section>
          <section
            aria-labelledby="event-essentials"
            className="space-y-6 rounded-xl border bg-card p-6"
          >
            <h2 id="event-essentials" className="text-2xl font-bold tracking-tight">
              The essentials
            </h2>
            <dl className="grid gap-6 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <dt className="text-sm font-semibold">Date and time</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    <time dateTime={event.startsAt}>
                      {start.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                    <br />
                    to{' '}
                    <time dateTime={event.endsAt}>
                      {end.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                    <span className="mt-1 block text-xs">Your local timezone</span>
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <dt className="text-sm font-semibold">Location</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {event.venue && <span className="block">{event.venue}</span>}
                    {event.address ? (
                      <span className="block">{event.address}</span>
                    ) : (
                      <span className="mb-2 block">
                        Exact address is shared with the host and confirmed participants.
                      </span>
                    )}
                    {cityName}, {countryName}
                    {event.administrativeDivision && (
                      <span className="block">{event.administrativeDivision}</span>
                    )}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <dt className="text-sm font-semibold">Who can play</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {experience}
                    <br />
                    {event.minimumAge === 0 ? 'All ages welcome' : `Ages ${event.minimumAge} and up`}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <VisibilityIcon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <dt className="text-sm font-semibold">Visibility</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {visibility}
                    <br />
                    {event.visibility === 'public'
                      ? 'Discoverable by everyone'
                      : event.visibility === 'private'
                        ? 'Host and current participants only'
                        : 'Shared by direct link'}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <dt className="text-sm font-semibold">Participants</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    {event.participantCount} of {event.capacity} player seats filled
                    <span className="mt-1 block text-xs">The host has a separate seat</span>
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock3 className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <dt className="text-sm font-semibold">Event status</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    {event.status === 'cancelled'
                      ? 'Canceled'
                      : start.getTime() <= Date.now()
                        ? 'Started or completed'
                        : 'Scheduled'}
                  </dd>
                </div>
              </div>
            </dl>
          </section>
          <section aria-labelledby="event-tags" className="space-y-4">
            <h2 id="event-tags" className="flex items-center gap-3 text-2xl font-bold tracking-tight">
              <Tag className="size-5 text-primary" aria-hidden="true" /> What to expect
            </h2>
            {event.tags.length ? (
              <ul className="flex flex-wrap gap-2">
                {event.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No additional tags for this event.</p>
            )}
          </section>
        </div>
        <aside
          aria-label="Participation and host"
          className="order-1 space-y-6 lg:order-2 lg:sticky lg:top-8"
        >
          {attendance}
          <section aria-label="Event host" className="rounded-xl border bg-card p-6">
            {host}
          </section>
        </aside>
      </div>
    </div>
  )
}
