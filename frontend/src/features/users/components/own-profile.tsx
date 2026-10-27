import { Link, useLocation } from 'react-router'
import { Pencil, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePublicProfile } from '../api/use-profiles'
import { useAuth } from '../api/use-auth'
import { ProfileSummary } from './profile-summary'

export function OwnProfile() {
  const auth = useAuth()
  const profile = usePublicProfile(auth.data?.id ?? '')
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
          <p className="text-sm font-medium text-primary">My Profile</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link to="/account">
              <Settings aria-hidden="true" />
              Account Settings
            </Link>
          </Button>
          <Button asChild>
            <Link to="/profile/edit">
              <Pencil aria-hidden="true" />
              Edit Profile
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
    </div>
  )
}
