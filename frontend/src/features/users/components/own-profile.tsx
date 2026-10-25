import { Link, useLocation } from 'react-router'
import { ArrowRight, LockKeyhole, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useOwnProfile } from '../api/use-profiles'
import { ProfileSummary } from './profile-summary'

export function OwnProfile() {
  const profile = useOwnProfile()
  const location = useLocation()
  const saved =
    typeof location.state === 'object' &&
    location.state !== null &&
    'profileSaved' in location.state &&
    location.state.profileSaved === true
  if (profile.isPending)
    return (
      <div role="status" aria-label="Loading your profile" className="mx-auto max-w-4xl space-y-6 py-8">
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    )
  if (profile.error || !profile.data)
    return (
      <section className="mx-auto max-w-xl space-y-4 py-12">
        <h1 className="text-2xl font-bold">Your profile couldn’t be loaded</h1>
        <p role="alert" className="text-muted-foreground">
          {profile.error?.message ?? 'Please try again shortly.'}
        </p>
        <Button onClick={() => void profile.refetch()}>Retry profile</Button>
      </section>
    )
  const data = profile.data
  const incomplete =
    data.displayName === 'RollCall player' && !data.biography && !data.country && !data.gameExperience.length
  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">Your player profile</p>
          <Link
            to="/account"
            className="text-sm text-muted-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Account settings
          </Link>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link to={`/users/${data.id}`}>
              View public profile
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild>
            <Link to="/profile/edit">
              <Pencil aria-hidden="true" />
              Edit profile
            </Link>
          </Button>
        </div>
      </div>
      {saved && (
        <p
          role="status"
          className="rounded-lg border border-primary/30 bg-accent p-4 text-sm text-accent-foreground"
        >
          Your profile has been saved.
        </p>
      )}
      {incomplete && (
        <section className="space-y-2 rounded-xl border border-primary/30 bg-accent p-6">
          <h2 className="text-xl font-semibold">Make yourself at home</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your account is ready. Add your name, a little about yourself and the games you enjoy whenever
            you’re ready.
          </p>
        </section>
      )}
      <ProfileSummary profile={data} />
      <section className="space-y-3 rounded-xl border bg-card p-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <LockKeyhole className="size-5 text-primary" aria-hidden="true" />
          Only visible to you
        </h2>
        <p className="text-sm text-muted-foreground">
          {data.birthYear === null
            ? 'You haven’t shared a birth year. This is optional.'
            : `Birth year: ${data.birthYear}. Self-declared; not verified.`}
        </p>
        <p className="text-xs text-muted-foreground">
          Your birth year and account email are never shown on your public profile.
        </p>
      </section>
    </div>
  )
}
