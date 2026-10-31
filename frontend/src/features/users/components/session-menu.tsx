import { UserRound } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { loginPath } from '@/lib/auth-navigation'

import { useSession } from '../api/use-session'
import { UserAvatar } from './user-avatar'
import { useAuth } from '../api/use-auth'
import { LogoutButton } from './logout-button'
import { AccountMenu } from './account-menu'
import { useNavigationAccount } from '../api/use-navigation-account'

export function SessionMenu() {
  const session = useSession()
  const location = useLocation()
  const auth = useAuth()
  const label = useNavigationAccount('displayName')

  if (session.isPending || auth.isPending)
    return (
      <div role="status" aria-label="Checking your session">
        <Skeleton className="h-9 w-28" />
      </div>
    )
  if (auth.error)
    return (
      <Button variant="outline" size="sm" onClick={() => void auth.refetch()}>
        Retry session
      </Button>
    )
  if (auth.data)
    return (
      <div className="flex items-center gap-2">
        {
          <span
            className="inline-block w-40 truncate text-sm text-muted-foreground"
            title={label ? `Welcome, ${label}` : undefined}
          >
            {label ? `Welcome, ${label}` : ' '}
          </span>
        }
        <AccountMenu key={auth.data.id} />
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
      <Button asChild size="icon" variant="ghost">
        <Link
          aria-label="Log in"
          to={
            location.pathname === '/login'
              ? '/login'
              : loginPath(`${location.pathname}${location.search}${location.hash}`)
          }
        >
          <UserRound aria-hidden="true" />
        </Link>
      </Button>
    )

  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:inline-flex">
        <UserAvatar name={session.data.displayName} size="sm" />
      </span>
      <span
        className="max-w-20 truncate text-sm font-medium sm:max-w-32"
        title={session.data.displayName}
      >
        {session.data.displayName}
      </span>
      <span className="text-xs text-muted-foreground">Demo</span>
      <LogoutButton demo iconOnly />
    </div>
  )
}
