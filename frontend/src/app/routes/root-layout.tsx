import { ScrollRestoration } from 'react-router'

import { AppLayout } from '@/components/layout/app-layout'
import { SessionMenu } from '@/features/users/components/session-menu'
import { demoModeEnabled } from '@/features/users/api/auth-client'

export function RootLayout() {
  return (
    <>
      <AppLayout account={<SessionMenu />} showDemoEvents={demoModeEnabled} />
      <ScrollRestoration />
    </>
  )
}
