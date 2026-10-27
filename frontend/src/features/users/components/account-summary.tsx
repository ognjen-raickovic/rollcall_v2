import { KeyRound, Settings, ShieldAlert, UserRound } from 'lucide-react'
import { Link, Navigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAccountIdentity, useAuth } from '../api/use-auth'
import { useAccountStatus } from '../api/use-account-status'
import { AccountInformation } from './account-information'
import { LogoutButton } from './logout-button'

export function AccountSummary() {
  const auth = useAuth(),
    identity = useAccountIdentity()
  const status = useAccountStatus(auth.data?.id ?? null)
  if (auth.isPending)
    return (
      <p role="status" className="py-12 text-muted-foreground">
        Checking your account…
      </p>
    )
  if (auth.error)
    return (
      <section className="space-y-4 py-12">
        <h1 className="text-3xl font-bold">Account unavailable</h1>
        <p role="alert">We couldn't restore your session.</p>
        <Button onClick={() => void auth.refetch()}>Retry account</Button>
      </section>
    )
  if (!auth.data) return <Navigate to="/login?returnTo=%2Faccount" replace />
  return (
    <div className="mx-auto max-w-4xl space-y-8 py-4 md:py-8">
      <header className="space-y-4">
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <Settings className="size-4" aria-hidden="true" />
          Private account
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
        <p className="max-w-2xl text-muted-foreground">
          Manage your account and security. These details are only visible to you.
        </p>
        <nav aria-label="Account navigation" className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link to="/profile">
              <UserRound aria-hidden="true" />
              My Profile
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/profile/edit">Edit Profile</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/events">Browse events</Link>
          </Button>
        </nav>
      </header>
      <div className="grid items-start gap-6 md:grid-cols-2">
        <section
          aria-labelledby="account-information"
          className="space-y-4 rounded-xl border bg-card p-6 md:p-8"
        >
          <h2 id="account-information" className="text-xl font-semibold">
            Account information
          </h2>
          <dl className="space-y-4 text-sm">
            <div className="space-y-1">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">
                {auth.data.email ?? 'No email available'}
              </dd>
            </div>
          </dl>
          {identity.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Verifying your account…
            </p>
          ) : identity.error ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">
                Your account could not be verified.
              </p>
              <Button variant="outline" onClick={() => void identity.refetch()}>
                Retry verification
              </Button>
            </div>
          ) : (
            <p className="text-sm text-primary">Account verified by RollCall.</p>
          )}
          {status.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking account access…
            </p>
          ) : status.error ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">
                Private details are unavailable until account access is verified.
              </p>
              <Button variant="outline" onClick={() => void status.refetch()}>
                Retry account access
              </Button>
            </div>
          ) : status.data?.status === 'suspended' ? (
            <p className="text-sm text-muted-foreground">
              Your application access is suspended. Password recovery and logout remain available.
            </p>
          ) : (
            <AccountInformation />
          )}
        </section>
        <section
          aria-labelledby="account-security"
          className="space-y-6 rounded-xl border bg-card p-6 md:p-8"
        >
          <h2 id="account-security" className="flex items-center gap-2 text-xl font-semibold">
            <KeyRound className="size-5 text-primary" aria-hidden="true" />
            Security
          </h2>
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Request a secure email link to choose a new password.
            </p>
            <Button asChild variant="outline">
              <Link to="/forgot-password">Reset password</Link>
            </Button>
          </div>
          <div className="space-y-3 border-t pt-6">
            <p className="text-sm text-muted-foreground">Log out of RollCall on this browser.</p>
            <LogoutButton />
          </div>
        </section>
      </div>
      <section
        aria-labelledby="account-danger"
        className="space-y-3 rounded-xl border border-destructive/40 bg-card p-6 md:p-8"
      >
        <h2 id="account-danger" className="flex items-center gap-2 text-xl font-semibold">
          <ShieldAlert className="size-5 text-destructive" aria-hidden="true" />
          Danger Zone
        </h2>
        <h3 className="font-semibold">Account deletion</h3>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Account deletion is not available yet. Your account, hosted events and game history will stay
          intact. No deletion action can be started here.
        </p>
      </section>
    </div>
  )
}
