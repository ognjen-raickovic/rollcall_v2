import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { emailSchema, passwordSchema } from '../api/auth-api'
import { authConfigurationError } from '../api/auth-client'
import { useAuth, useRegister } from '../api/use-auth'
import { AuthField } from './auth-fields'
import { AuthShell } from './auth-shell'
import { HttpError } from '@/lib/http-client'
import { safeReturnTo, loginPath } from '@/lib/auth-navigation'

const schema = z
  .object({
    username: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z][A-Za-z0-9_]{2,23}$/,
        'Use 3–24 letters, numbers or underscores, starting with a letter.',
      ),
    email: emailSchema,
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth.')
      .refine((value) => {
        const parsed = new Date(value + 'T00:00:00Z')
        return (
          Number.isFinite(parsed.getTime()) &&
          parsed.toISOString().slice(0, 10) === value &&
          value >= '1900-01-01' &&
          value <= new Date().toISOString().slice(0, 10)
        )
      }, 'Enter a real birth date from 1900 through today.'),
    password: passwordSchema,
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    path: ['confirmation'],
    message: 'Passwords must match.',
  })

export function RegisterForm() {
  const [params] = useSearchParams()
  const returnTo = params.has('returnTo') ? safeReturnTo(params.get('returnTo')) : undefined
  const auth = useAuth()
  const register = useRegister()
  const configuration = authConfigurationError()
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', email: '', dateOfBirth: '', password: '', confirmation: '' },
  })
  if (auth.data) return <Navigate to={returnTo ?? '/account'} replace />
  return (
    <AuthShell
      title={register.data?.confirmationRequired ? 'Check your email' : 'Create your account'}
      description={
        register.data?.confirmationRequired
          ? undefined
          : 'Choose a username and confirm your email to get started.'
      }
    >
      {register.data?.confirmationRequired ? (
        <div className="space-y-4 text-center">
          <p role="status" className="text-sm text-muted-foreground">
            If registration is available for this address, a confirmation link is on its way. Open it in
            this browser to finish. Existing accounts can log in or reset their password.
          </p>
          <Button asChild className="w-full">
            <Link to={returnTo ? loginPath(returnTo) : '/login'}>Go to login</Link>
          </Button>
        </div>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit(({ confirmation: _confirmation, ...values }) =>
            register.mutate(
              { ...values, returnTo },
              {
                onError: (error) => {
                  if (error instanceof HttpError && error.fields.username?.[0])
                    form.setError('username', { message: error.fields.username[0] })
                },
              },
            ),
          )}
        >
          {configuration && (
            <p role="alert" className="text-sm text-destructive">
              {configuration}
            </p>
          )}
          <AuthField
            id="register-username"
            label="Username"
            type="text"
            autoComplete="username"
            registration={form.register('username')}
            error={form.formState.errors.username?.message}
          />
          <AuthField
            id="register-email"
            label="Email"
            type="email"
            autoComplete="email"
            registration={form.register('email')}
            error={form.formState.errors.email?.message}
          />
          <AuthField
            id="register-date-of-birth"
            label="Date of birth"
            type="date"
            autoComplete="bday"
            registration={form.register('dateOfBirth')}
            error={form.formState.errors.dateOfBirth?.message}
          />
          <p className="text-xs text-muted-foreground">
            Your date of birth stays private and is not shown on your public profile.
          </p>
          <AuthField
            id="register-password"
            label="Password"
            type="password"
            autoComplete="new-password"
            registration={form.register('password')}
            error={form.formState.errors.password?.message}
          />
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
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              to={returnTo ? loginPath(returnTo) : '/login'}
              className="text-primary hover:underline"
            >
              Log in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}
