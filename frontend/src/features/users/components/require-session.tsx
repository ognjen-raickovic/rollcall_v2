import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { loginPath } from '@/lib/auth-navigation'

import { useSession } from '../api/use-session'

type RequireSessionProps = { children: ReactNode }

export function RequireSession({ children }: RequireSessionProps) {
  const session = useSession()
  const location = useLocation()
  const signInPath = loginPath(`${location.pathname}${location.search}${location.hash}`)

  if (session.isPending)
    return (
      <p role="status" className="py-12 text-muted-foreground">
        Checking your session...
      </p>
    )
  if (session.error)
    return (
      <section className="space-y-4 py-12">
        <h1 className="text-2xl font-bold">We couldn’t check your session</h1>
        <p role="alert" className="text-muted-foreground">
          Please try again to continue.
        </p>
        <Button onClick={() => void session.refetch()}>Try again</Button>
        <Button asChild variant="outline">
          <Link to={signInPath}>Go to login</Link>
        </Button>
      </section>
    )
  if (!session.data) return <Navigate to={signInPath} replace />
  return children
}
