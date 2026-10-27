import { Button } from '@/components/ui/button'
import { useOwnProfile } from '../api/use-profiles'

export function AccountInformation() {
  const profile = useOwnProfile()
  if (profile.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading private account details…
      </p>
    )
  if (profile.error || !profile.data)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          Your private account details couldn't be loaded.
        </p>
        <Button variant="outline" onClick={() => void profile.refetch()}>
          Retry details
        </Button>
      </div>
    )
  return (
    <dl className="space-y-4 border-t pt-4 text-sm">
      {profile.data.username && (
        <div className="space-y-1">
          <dt className="text-muted-foreground">Username</dt>
          <dd className="font-medium [overflow-wrap:anywhere]">@{profile.data.username}</dd>
        </div>
      )}
      <div className="space-y-1">
        <dt className="text-muted-foreground">Member since</dt>
        <dd>
          {new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date(profile.data.createdAt))}
        </dd>
      </div>
      <div className="space-y-1">
        <dt className="text-muted-foreground">Date of birth</dt>
        <dd>
          {profile.data.hasDateOfBirth
            ? 'Added during registration. Your full date stays private and is not displayed here.'
            : 'No full date of birth available.'}
        </dd>
      </div>
      {profile.data.birthYear !== null && (
        <div className="space-y-1">
          <dt className="text-muted-foreground">Private birth year</dt>
          <dd>{profile.data.birthYear} · Self-declared</dd>
        </div>
      )}
    </dl>
  )
}
