import { BackLink } from '@/components/back-link'
import { Link } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { HttpError } from '@/lib/http-client'
import { usePublicProfile } from '../api/use-profiles'
import { ProfileSummary } from './profile-summary'
import { useAuth } from '../api/use-auth'

type PublicProfileProps = { userId: string }

export function PublicProfile({ userId }: PublicProfileProps) {
  const profile = usePublicProfile(userId)
  const auth = useAuth()
  const own = auth.data?.id === userId
  if (
    !z.uuid().safeParse(userId).success ||
    (profile.error instanceof HttpError && profile.error.status === 404)
  )
    return (
      <section className="mx-auto max-w-xl space-y-4 py-12">
        <h1 className="text-3xl font-bold">Player not found</h1>
        <p className="text-muted-foreground">
          This profile isn’t available. You can still find your next table.
        </p>
        <Button asChild>
          <Link to="/events">Explore events</Link>
        </Button>
      </section>
    )
  if (profile.isPending)
    return (
      <div
        role="status"
        aria-label="Loading player profile"
        className="mx-auto max-w-4xl space-y-6 py-8"
      >
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    )
  if (profile.error || !profile.data)
    return (
      <section className="mx-auto max-w-xl space-y-4 py-12">
        <h1 className="text-2xl font-bold">This profile couldn’t be loaded</h1>
        <p role="alert" className="text-muted-foreground">
          {profile.error?.message ?? 'Please try again shortly.'}
        </p>
        <Button onClick={() => void profile.refetch()}>Retry profile</Button>
      </section>
    )
  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <BackLink to={own ? '/profile' : '/events'}>
          {own ? 'Back to My Profile' : 'Back to events'}
        </BackLink>
        {own && (
          <Button asChild variant="outline">
            <Link to="/account">Account Settings</Link>
          </Button>
        )}
      </div>
      <ProfileSummary profile={profile.data} />
    </div>
  )
}
