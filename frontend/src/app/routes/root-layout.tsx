import { ScrollRestoration, useLocation } from 'react-router'
import { useAuth } from '@/features/users/api/use-auth'
import { useAccountStatus } from '@/features/users/api/use-account-status'
import { SuspendedAccount } from '@/features/users/components/suspended-account'
import { SuspensionNotice } from '@/features/users/components/suspension-notice'
import { LogoutFeedback } from '@/features/users/components/logout-feedback'

import { AppLayout } from '@/components/layout/app-layout'
import { SessionMenu } from '@/features/users/components/session-menu'
import { demoModeEnabled } from '@/features/users/api/auth-client'

export function RootLayout() {
  const auth = useAuth(),
    status = useAccountStatus(auth.data?.id ?? null),
    { pathname } = useLocation()
  const suspended = status.data?.status === 'suspended'
  const safe =
    pathname === '/' ||
    pathname === '/events' ||
    (pathname.startsWith('/events/') && pathname !== '/events/new' && !pathname.endsWith('/edit')) ||
    pathname.startsWith('/users/') ||
    ['/about', '/contact', '/auth/callback', '/reset-password', '/forgot-password'].includes(pathname)
  return (
    <>
      <AppLayout
        account={<SessionMenu />}
        showDemoEvents={demoModeEnabled}
        content={suspended && !safe ? <SuspendedAccount /> : undefined}
        notice={
          <>
            <LogoutFeedback />
            {suspended && safe && <SuspensionNotice />}
          </>
        }
      />
      <ScrollRestoration />
    </>
  )
}
