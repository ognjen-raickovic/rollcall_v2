import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { useUser } from '../api/use-users'
import { UserAvatar } from './user-avatar'

type PublicUserSummaryProps = { userId: number }

export function PublicUserSummary({ userId }: PublicUserSummaryProps) {
  const user = useUser(userId)
  if (user.isPending)
    return (
      <div role="status" aria-label="Loading host profile" className="space-y-3">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-4 w-full" />
      </div>
    )
  if (user.error || !user.data)
    return (
      <div role="alert" className="space-y-3">
        <p className="text-sm text-muted-foreground">The host profile couldn’t be loaded.</p>
        <Button variant="outline" size="sm" onClick={() => void user.refetch()}>
          Retry host profile
        </Button>
      </div>
    )
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <UserAvatar name={user.data.displayName} />
        <div>
          <p className="text-xs text-muted-foreground">Hosted by</p>
          <p className="font-semibold">{user.data.displayName}</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{user.data.bio}</p>
    </div>
  )
}
