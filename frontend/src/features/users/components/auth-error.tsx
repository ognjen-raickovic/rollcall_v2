import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { AuthShell } from './auth-shell'

// Route-level fallback never renders provider errors, URL fragments or stack traces.
export function AuthError() {
  return (
    <AuthShell title="Let's try again" description="This account page couldn't be opened.">
      <div className="space-y-6 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          Your session may need a fresh start. Return to login and try again.
        </p>
        <Button asChild className="w-full">
          <Link to="/login">Go to login</Link>
        </Button>
      </div>
    </AuthShell>
  )
}
