import { Link } from 'react-router'
import { CircleCheck, CircleAlert, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '../api/use-auth'
import { AuthShell } from './auth-shell'

export function AuthCallback() {
  const auth = useAuth()
  return (
    <AuthShell
      title={auth.isPending ? 'Confirming your email' : auth.data ? 'Email confirmed' : 'Unable to confirm'}
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
            <Link to="/account">Continue to your account</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6 text-center">
          <CircleAlert className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <p role="alert" className="text-sm text-muted-foreground">
            This link may have expired, already been used or opened in another browser. Go to login to request
            a fresh confirmation.
          </p>
          <Button asChild className="w-full">
            <Link to="/login">Go to login</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  )
}
