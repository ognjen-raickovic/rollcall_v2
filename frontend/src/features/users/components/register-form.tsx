import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { emailSchema, passwordSchema } from '../api/auth-api'
import { authConfigurationError } from '../api/auth-client'
import { useAuth, useRegister } from '../api/use-auth'
import { AuthField } from './auth-fields'
import { AuthShell } from './auth-shell'

const schema = z
  .object({ email: emailSchema, password: passwordSchema, confirmation: z.string() })
  .refine((value) => value.password === value.confirmation, {
    path: ['confirmation'],
    message: 'Passwords must match.',
  })

export function RegisterForm() {
  const auth = useAuth()
  const register = useRegister()
  const configuration = authConfigurationError()
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', confirmation: '' },
  })
  if (auth.data) return <Navigate to="/account" replace />
  return (
    <AuthShell
      title="Find your people."
      description="Create a RollCall account with your email and a password."
    >
      {register.data?.confirmationRequired ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Check your email</h2>
          <p role="status" className="text-sm text-muted-foreground">
            If registration is available for this address, a confirmation link is on its way. Open it in this
            browser to finish. Existing accounts can log in or reset their password.
          </p>
          <Button asChild>
            <Link to="/login">Go to login</Link>
          </Button>
        </div>
      ) : (
        <form
          noValidate
          className="space-y-6"
          onSubmit={form.handleSubmit(({ email, password }) => register.mutate({ email, password }))}
        >
          {configuration && (
            <p role="alert" className="text-sm text-destructive">
              {configuration}
            </p>
          )}
          <AuthField
            id="register-email"
            label="Email"
            type="email"
            autoComplete="email"
            registration={form.register('email')}
            error={form.formState.errors.email?.message}
          />
          <AuthField
            id="register-password"
            label="Password"
            type="password"
            autoComplete="new-password"
            registration={form.register('password')}
            error={form.formState.errors.password?.message}
          />
          <p className="text-xs text-muted-foreground">Use 8–72 characters. Choose a unique password.</p>
          <AuthField
            id="register-confirmation"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            registration={form.register('confirmation')}
            error={form.formState.errors.confirmation?.message}
          />
          {register.error && (
            <p role="alert" className="text-sm text-destructive">
              {register.error.message}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={Boolean(configuration) || register.isPending || auth.isPending}
          >
            {register.isPending ? 'Creating account...' : 'Create account'}
          </Button>
          <p className="text-sm text-muted-foreground">
            Already registered?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Log in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}
