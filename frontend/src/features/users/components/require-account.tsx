import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { loginPath } from '@/lib/auth-navigation'
import { useAuth } from '../api/use-auth'
import { useAccountStatus } from '../api/use-account-status'
import { SuspendedAccount } from './suspended-account'

type RequireAccountProps = { children: ReactNode }

export function RequireAccount({ children }: RequireAccountProps) {
  const auth = useAuth()
  const status=useAccountStatus(auth.data?.id??null)
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
          Try again or log in to continue.
        </p>
        <Button onClick={() => void auth.refetch()}>Retry account</Button>
        <Button asChild variant="outline">
          <Link to={loginPath(`${location.pathname}${location.search}`)}>Log in</Link>
        </Button>
      </section>
    )
  if (!auth.data) return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />
  if(status.isPending)return <p role="status">Checking account access…</p>
  if(status.error)return <section className="space-y-3"><p role="alert">We could not verify your account access.</p><Button onClick={()=>void status.refetch()}>Retry account access</Button></section>
  if(status.data.status==='suspended')return <SuspendedAccount/>
  return children
}
