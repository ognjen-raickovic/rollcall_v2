import { CalendarDays, Gamepad2, MapPin } from 'lucide-react'
import type { PublicProfile } from '../types'
import { UserAvatar } from './user-avatar'

type ProfileSummaryProps = { profile: PublicProfile }

export function ProfileSummary({ profile }: ProfileSummaryProps) {
  const location = [profile.city?.name, profile.country?.name].filter(Boolean).join(', ')
  return (
    <div className="space-y-8">
      <section className="space-y-6 rounded-xl border bg-card p-6 md:p-8">
        <div className="flex items-start gap-4">
          <UserAvatar name={profile.displayName} />
          <div className="min-w-0 space-y-2">
            <h1 className="text-3xl font-bold tracking-tight [overflow-wrap:anywhere]">
              {profile.displayName}
            </h1>
            <p className="text-sm text-muted-foreground">Tabletop player</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {location && (
            <p className="flex items-center gap-2 [overflow-wrap:anywhere]">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {location}
            </p>
          )}
          <p className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
            Joined{' '}
            {new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(
              new Date(profile.createdAt),
            )}
          </p>
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">About</h2>
          {profile.biography ? (
            <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
              {profile.biography}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">This player hasn’t added a biography yet.</p>
          )}
        </div>
      </section>
      <section className="space-y-6 rounded-xl border bg-card p-6 md:p-8">
        <div className="space-y-2">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Gamepad2 className="size-5 text-primary" aria-hidden="true" />
            Games at my table
          </h2>
          <p className="text-sm text-muted-foreground">Experience is self-declared, not verified.</p>
        </div>
        {profile.gameExperience.length ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {profile.gameExperience.map((game) => (
              <li key={game.gameId} className="space-y-3 rounded-lg border bg-background p-4">
                <p className="font-semibold [overflow-wrap:anywhere]">{game.gameName}</p>
                <span className="inline-flex rounded-md bg-accent px-3 py-1 text-sm font-medium text-accent-foreground capitalize">
                  {game.experience}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No games added yet. Every great table starts somewhere.
          </p>
        )}
      </section>
    </div>
  )
}
