import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { safeReturnTo } from '@/lib/auth-navigation'
import { emailSchema } from '../api/auth-api'
import { authConfigurationError, demoModeEnabled } from '../api/auth-client'
import { useAuth, useAuthLogin, useResendConfirmation } from '../api/use-auth'
import { AuthField } from './auth-fields'
import { AuthShell } from './auth-shell'
import { AuthenticationError } from '../api/auth-errors'

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(256),
})

export function LoginForm() {
  const [params] = useSearchParams()
  const returnTo = safeReturnTo(params.get('returnTo'))
  const auth = useAuth()
  const login = useAuthLogin()
  const resend = useResendConfirmation()
  const configuration = authConfigurationError()
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })
  if (auth.data) return <Navigate to={returnTo} replace />
  return (
    <AuthShell title="Welcome back" description="Log in to your RollCall account.">
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
      >
        {params.get('passwordUpdated') === 'true' && (
          <p role="status" className="text-sm text-primary">
            Password updated. Log in with your new password.
          </p>
        )}
        {configuration && (
          <p role="alert" className="text-sm text-destructive">
            {configuration}
          </p>
        )}
        <AuthField
          id="login-email"
          label="Email"
          type="email"
          autoComplete="email"
          registration={form.register('email')}
          error={form.formState.errors.email?.message}
        />
        <AuthField
          id="login-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          registration={form.register('password')}
          error={form.formState.errors.password?.message}
        />
        {login.error && (
          <p role="alert" className="text-sm text-destructive">
            {login.error.message}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={Boolean(configuration) || login.isPending || auth.isPending}
        >
          {login.isPending ? 'Logging in...' : 'Log in'}
        </Button>
      </form>
      <div className="space-y-4 text-center text-sm">
        <Link className="block text-primary hover:underline" to="/forgot-password">
          Forgot password?
        </Link>
        <p className="text-muted-foreground">
          New to RollCall?{' '}
          <Link
            className="text-primary hover:underline"
            to={
              params.has('returnTo') ? `/register?returnTo=${encodeURIComponent(returnTo)}` : '/register'
            }
          >
            Create an account
          </Link>
        </p>
        {login.error instanceof AuthenticationError && login.error.code === 'email_not_confirmed' && (
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              disabled={Boolean(configuration) || resend.isPending}
              onClick={() => {
                void form.trigger('email').then((valid) => {
                  if (valid) resend.mutate(form.getValues('email'))
                })
              }}
            >
              Resend confirmation
            </Button>
            {resend.isSuccess && (
              <p role="status" className="text-muted-foreground">
                If this address needs confirmation, a new link has been sent. Check your inbox.
              </p>
            )}
            {resend.error && (
              <p role="alert" className="text-destructive">
                {resend.error.message}
              </p>
            )}
          </div>
        )}
        {demoModeEnabled && (
          <Link
            className="block text-muted-foreground underline"
            to={`/demo/login?returnTo=${encodeURIComponent(returnTo)}`}
          >
            Development demo players
          </Link>
        )}
      </div>
    </AuthShell>
  )
}
