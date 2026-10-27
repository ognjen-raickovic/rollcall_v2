import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Tabs } from 'radix-ui'
import { BackLink } from '@/components/back-link'
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
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'games' ? 'games' : 'profile'
  if (profile.isPending)
    return (
      <div
        role="status"
        aria-label="Loading profile editor"
        className="mx-auto max-w-2xl space-y-6 py-8"
      >
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    )
  if (!profile.data)
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
    <div className="mx-auto max-w-2xl space-y-8 py-4 md:py-8">
      <div className="space-y-4">
        <BackLink to="/profile">Back to My Profile</BackLink>
        <h1 className="text-3xl font-bold tracking-tight">Edit Profile</h1>
        <p className="max-w-2xl text-muted-foreground">
          A familiar name, a few favorite games, and a little about you. Make it easier to find good
          company.
        </p>
      </div>
      <Tabs.Root
        key={profile.data.id}
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params)
          if (value === 'profile') next.delete('tab')
          else next.set('tab', 'games')
          setParams(next)
        }}
        className="space-y-6"
      >
        <Tabs.List
          aria-label="Profile editor sections"
          className="grid grid-cols-2 gap-2 rounded-lg border bg-muted p-1"
        >
          <Tabs.Trigger
            value="profile"
            className="min-h-11 rounded-md px-4 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground"
          >
            Profile
          </Tabs.Trigger>
          <Tabs.Trigger
            value="games"
            className="min-h-11 rounded-md px-4 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground"
          >
            My games
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content
          value="profile"
          forceMount
          hidden={tab !== 'profile'}
          className="profile-editor-panel outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=inactive]:hidden"
        >
          <ProfileForm profile={profile.data} renderLocation={renderLocation} />
        </Tabs.Content>
        <Tabs.Content
          value="games"
          forceMount
          hidden={tab !== 'games'}
          className="profile-editor-panel outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=inactive]:hidden"
        >
          <ProfileGamesEditor {...games} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
