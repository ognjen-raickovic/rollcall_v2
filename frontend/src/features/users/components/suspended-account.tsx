import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuth, useAuthLogout } from '../api/use-auth'
import { useAccountStatus } from '../api/use-account-status'
export function SuspendedAccount() {
  const auth = useAuth(),
    status = useAccountStatus(auth.data?.id ?? null),
    logout = useAuthLogout()
  return (
    <section
      className="mx-auto max-w-2xl space-y-5 rounded-xl border bg-card p-6"
      aria-labelledby="suspended-heading"
    >
      <h1 id="suspended-heading" className="text-3xl font-bold">
        Account suspended
      </h1>
      <p>
        Your RollCall application access is suspended. Your account and existing events have not been deleted.
      </p>
      <p className="text-muted-foreground">
        You can browse public events or log out. If your access is reinstated, check again to resume using
        your existing account.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={status.isFetching} onClick={() => void status.refetch()}>
          {status.isFetching ? 'Checking access…' : 'Check access'}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/events">Browse public events</Link>
        </Button>
        <Button variant="outline" disabled={logout.isPending} onClick={() => logout.mutate()}>
          Log out of RollCall
        </Button>
      </div>
      {status.error && <p role="alert">Your account status could not be checked. Please retry.</p>}
      {logout.error && <p role="alert">Logout failed. Please retry.</p>}
    </section>
  )
}
