import { LogIn } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { loginPath } from '@/lib/auth-navigation'

import { useSession } from '../api/use-session'
import { UserAvatar } from './user-avatar'
import { useAuth } from '../api/use-auth'
import { LogoutButton } from './logout-button'
import { AdminNavigation } from './administration'

export function SessionMenu() {
  const session = useSession()
  const location = useLocation()
  const auth = useAuth()

  if (session.isPending || auth.isPending)
    return (
      <div role="status" aria-label="Checking your session">
        <Skeleton className="h-9 w-28" />
      </div>
    )
  if (auth.data)
    return (
      <div className="flex items-center gap-2">
        <AdminNavigation />
        <Link
          to="/profile"
          className="max-w-28 truncate text-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
          title="Your player profile"
        >
          My Profile
        </Link>
        <Link
          aria-label="Account Settings"
          to="/account"
          className="text-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          Settings
        </Link>
        <LogoutButton iconOnly />
      </div>
    )
  if (session.error)
    return (
      <Button variant="outline" size="sm" onClick={() => void session.refetch()}>
        Retry session
      </Button>
    )
  if (!session.data)
    return (
      <Button asChild size="sm">
        <Link
          to={
            location.pathname === '/login'
              ? '/login'
              : loginPath(`${location.pathname}${location.search}${location.hash}`)
          }
        >
          <LogIn aria-hidden="true" /> Log in
        </Link>
      </Button>
    )

  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:inline-flex">
        <UserAvatar name={session.data.displayName} size="sm" />
      </span>
      <span className="max-w-20 truncate text-sm font-medium sm:max-w-32" title={session.data.displayName}>
        {session.data.displayName}
      </span>
      <span className="text-xs text-muted-foreground">Demo</span>
      <LogoutButton demo iconOnly />
    </div>
  )
}
