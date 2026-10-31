import { useRef, type ReactNode, type RefObject } from 'react'
import { CalendarDays, ChevronRight, LogOut, Settings, UserRound } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { loginPath } from '@/lib/auth-navigation'
import { useAuth } from '../api/use-auth'
import { useSession } from '../api/use-session'
import { useNavigationAccount } from '../api/use-navigation-account'
import { DashboardAccountLink } from './dashboard-account-link'
import { LogoutButton } from './logout-button'

type MobileSessionMenuProps = {
  renderNavigation: (props: {
    triggerRef: RefObject<HTMLButtonElement | null>
    renderAccount: (close: (afterClose?: () => void) => void) => ReactNode
  }) => ReactNode
}

const row =
  'flex min-h-11 w-full min-w-0 items-center gap-3 rounded-md border px-4 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function MobileSessionMenu({ renderNavigation }: MobileSessionMenuProps) {
  const auth = useAuth(),
    demo = useSession(),
    label = useNavigationAccount(),
    location = useLocation()
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Keep the existing confirmation mounted outside the drawer portal while it closes.
  return (
    <LogoutButton
      demo={!auth.data && Boolean(demo.data)}
      returnFocusRef={triggerRef}
      trigger={(openLogout, busy) =>
        renderNavigation({
          triggerRef,
          renderAccount: (close) => {
            if (auth.isPending || demo.isPending) return <p role="status">Checking your session...</p>
            if (auth.error || demo.error)
              return (
                <div className="space-y-3">
                  <p role="alert">Your session could not be checked.</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void auth.refetch()
                      void demo.refetch()
                    }}
                  >
                    Retry session
                  </Button>
                </div>
              )
            if (auth.data)
              return (
                <>
                  <Link to="/profile" onClick={() => close()} className={row} aria-label="My Profile">
                    <UserRound className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate" title={label ?? undefined}>
                      {label ?? 'My Profile'}
                    </span>
                    <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                  </Link>
                  <Link to="/my-events" onClick={() => close()} className={row}>
                    <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                    My Events
                  </Link>
                  <Link to="/account" onClick={() => close()} className={row}>
                    <Settings className="size-4 shrink-0" aria-hidden="true" />
                    Settings
                  </Link>
                  <DashboardAccountLink onNavigate={() => close()} className={row} />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => close(openLogout)}
                    className={row}
                  >
                    <LogOut className="size-4 shrink-0" aria-hidden="true" />
                    Log out
                  </button>
                </>
              )
            if (demo.data)
              return (
                <>
                  <p className="break-words text-sm">
                    {demo.data.displayName} <span className="text-muted-foreground">(Demo)</span>
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => close(openLogout)}
                    className={row}
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Log out of demo
                  </button>
                </>
              )
            return (
              <Link
                to={
                  location.pathname === '/login'
                    ? '/login'
                    : loginPath(`${location.pathname}${location.search}${location.hash}`)
                }
                onClick={() => close()}
                className={row}
              >
                <UserRound className="size-5" aria-hidden="true" />
                Log in
              </Link>
            )
          },
        })
      }
    />
  )
}
