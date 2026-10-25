import { Link, Navigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAccountIdentity, useAuth, useAuthLogout } from '../api/use-auth'
import { demoModeEnabled } from '../api/auth-client'

export function AccountSummary() {
  const auth = useAuth()
  const identity = useAccountIdentity()
  const logout = useAuthLogout()
  if (auth.isPending)
    return (
      <p role="status" className="py-12 text-muted-foreground">
        Checking your account...
      </p>
    )
  if (!auth.data) return <Navigate to="/login?returnTo=%2Faccount" replace />
  return (
    <section className="mx-auto max-w-xl space-y-6 py-4 md:py-12">
      <h1 className="text-3xl font-bold tracking-tight">Your account</h1>
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <p className="font-medium">{auth.data.email ?? 'Signed-in account'}</p>
        {identity.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Verifying your account with the API...
          </p>
        ) : identity.error ? (
          <div className="space-y-4">
            <p role="alert" className="text-sm text-destructive">
              {identity.error.message}
            </p>
            <Button variant="outline" onClick={() => void identity.refetch()}>
              Retry account verification
            </Button>
          </div>
        ) : (
          <p role="status" className="text-sm text-primary">
            Account verified by RollCall.
          </p>
        )}
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your account, profile and self-declared game experience are saved. Events and attendance still use
          demo data; this account cannot host or join those demo events.
        </p>
        {demoModeEnabled && (
          <p className="text-sm text-muted-foreground">
            To test mock event actions, log out first and choose a development demo player on the login page.
          </p>
        )}
        <div className="flex flex-wrap gap-4">
          <Button asChild>
            <Link to="/profile">Your profile</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/events">Browse events</Link>
          </Button>
          <Button disabled={logout.isPending} onClick={() => logout.mutate()}>
            Log out
          </Button>
        </div>
        {logout.error && (
          <p role="alert" className="text-sm text-destructive">
            {logout.error.message}
          </p>
        )}
      </div>
    </section>
  )
}
