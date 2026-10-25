import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { loginPath } from '@/lib/auth-navigation'
import { useAuth } from '../api/use-auth'

type RequireAccountProps = { children: ReactNode }

export function RequireAccount({ children }: RequireAccountProps) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.isPending)
    return (
      <p role="status" className="py-12 text-muted-foreground">
        Checking your account...
      </p>
    )
  if (auth.error)
    return (
      <section className="space-y-4 py-12">
        <h1 className="text-2xl font-bold">We couldn’t restore your account</h1>
        <p role="alert" className="text-muted-foreground">
          Try again or log in to continue to your profile.
        </p>
        <Button onClick={() => void auth.refetch()}>Retry account</Button>
        <Button asChild variant="outline">
          <Link to={loginPath(`${location.pathname}${location.search}`)}>Log in</Link>
        </Button>
      </section>
    )
  if (!auth.data) return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />
  return children
}
