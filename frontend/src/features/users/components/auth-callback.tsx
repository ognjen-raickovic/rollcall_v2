import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuth } from '../api/use-auth'
import { AuthShell } from './auth-shell'

export function AuthCallback() {
  const auth = useAuth()
  return (
    <AuthShell title="Confirm your account." description="Finish connecting your email to RollCall.">
      {auth.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Confirming your email...
        </p>
      ) : auth.data ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-muted-foreground">
            Your email is confirmed and you are logged in.
          </p>
          <Button asChild>
            <Link to="/account">Continue to your account</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p role="alert" className="text-sm text-muted-foreground">
            This link could not start a session. It may have expired, already been used, or been opened in
            another browser. Try logging in or requesting another confirmation.
          </p>
          <Button asChild>
            <Link to="/login">Go to login</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  )
}
