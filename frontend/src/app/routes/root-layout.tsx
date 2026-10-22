import { ScrollRestoration } from 'react-router'

import { AppLayout } from '@/components/layout/app-layout'
import { SessionMenu } from '@/features/users/components/session-menu'

export function RootLayout() {
  return (
    <>
      <AppLayout account={<SessionMenu />} />
      <ScrollRestoration />
    </>
  )
}
