import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthSessionSync } from '@/features/users/components/auth-session-sync'

const queryClient = new QueryClient()

type ProvidersProps = {
  children: ReactNode
}

// All global providers in one place (data cache now, later e.g. theme or auth).
export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSessionSync />
      {children}
    </QueryClientProvider>
  )
}
