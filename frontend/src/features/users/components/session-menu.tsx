import { LogIn, LogOut } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { loginPath } from '@/lib/auth-navigation'

import { useLogout, useSession } from '../api/use-session'
import { UserAvatar } from './user-avatar'
import { useAuth, useAuthLogout } from '../api/use-auth'

export function SessionMenu() {
  const session = useSession()
  const logout = useLogout()
  const location = useLocation()
  const auth = useAuth()
  const realLogout = useAuthLogout()

  if (session.isPending || auth.isPending)
    return (
      <div role="status" aria-label="Checking your session">
        <Skeleton className="h-9 w-28" />
      </div>
    )
  if (auth.data)
    return (
      <div className="flex items-center gap-2">
        <Link
          to="/account"
          className="max-w-28 truncate text-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
          title={auth.data.email ?? 'Your account'}
        >
          Account
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Log out"
          title="Log out"
          disabled={realLogout.isPending}
          onClick={() => realLogout.mutate()}
        >
          <LogOut aria-hidden="true" />
        </Button>
        {realLogout.error && (
          <p role="alert" className="text-sm text-destructive">
            Logout failed. Try again.
          </p>
        )}
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
      <Button
        variant="ghost"
        size="icon"
        aria-label="Log out"
        title="Log out"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        <LogOut aria-hidden="true" />
      </Button>
      {logout.error && (
        <p role="alert" className="text-sm text-destructive">
          Logout failed. Try again.
        </p>
      )}
    </div>
  )
}
