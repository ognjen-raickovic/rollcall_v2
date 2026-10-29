import { Link, useSearchParams } from 'react-router'
import { safeReturnTo, loginPath } from '@/lib/auth-navigation'
import { CircleCheck, CircleAlert, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '../api/use-auth'
import { AuthShell } from './auth-shell'

export function AuthCallback() {
  const [params] = useSearchParams()
  const returnTo = params.has('returnTo') ? safeReturnTo(params.get('returnTo')) : undefined
  const auth = useAuth()
  return (
    <AuthShell
      title={
        auth.isPending ? 'Confirming your email' : auth.data ? 'Email confirmed' : 'Unable to confirm'
      }
    >
      {auth.isPending ? (
        <div role="status" className="space-y-4 text-center">
          <LoaderCircle className="mx-auto size-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Checking your confirmation link…</p>
        </div>
      ) : auth.data ? (
        <div className="space-y-6 text-center">
          <CircleCheck className="mx-auto size-10 text-primary" aria-hidden="true" />
          <p role="status" className="text-sm text-muted-foreground">
            Your email is confirmed and you are logged in.
          </p>
          <Button asChild className="w-full">
            <Link to={returnTo ?? '/account'}>
              {returnTo ? 'Continue to your event' : 'Continue to your account'}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6 text-center">
          <CircleAlert className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <p role="alert" className="text-sm text-muted-foreground">
            This link may have expired, already been used or opened in another browser. Go to login to
            request a fresh confirmation.
          </p>
          <Button asChild className="w-full">
            <Link to={returnTo ? loginPath(returnTo) : '/login'}>Go to login</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  )
}
