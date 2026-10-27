import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useOwnProfile } from '../api/use-profiles'
import { ProfileForm, type ProfileLocationSlotProps } from './profile-form'
import { ProfileGamesEditor, type ProfileGamesEditorProps } from './profile-games-editor'

type ProfileEditorProps = ProfileGamesEditorProps & {
  renderLocation: (props: ProfileLocationSlotProps) => ReactNode
}

export function ProfileEditor({ renderLocation, ...games }: ProfileEditorProps) {
  const profile = useOwnProfile()
  if (profile.isPending)
    return (
      <div role="status" aria-label="Loading profile editor" className="mx-auto max-w-4xl space-y-6 py-8">
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
  return (
    <div className="mx-auto max-w-5xl space-y-8 py-4 md:py-8">
      <div className="space-y-4">
        <Link
          to="/profile"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to My Profile
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Edit Profile</h1>
        <p className="max-w-2xl text-muted-foreground">
          A familiar name, a few favorite games, and a little about you. Make it easier to find good company.
        </p>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-3">
        <div className="min-w-0 space-y-8 lg:col-span-2">
          <ProfileForm key={profile.data.id} profile={profile.data} renderLocation={renderLocation} />
          <ProfileGamesEditor key={`games-${profile.data.id}`} {...games} />
        </div>
        <aside className="space-y-4 rounded-xl border bg-card p-6 lg:sticky lg:top-6">
          <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold">Share what feels right</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your display name, biography, country, city and chosen games are public. Your birth year and
            account email stay private.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Game experience is self-declared. It describes your familiarity and never verifies your skills or
            eligibility.
          </p>
        </aside>
      </div>
    </div>
  )
}
