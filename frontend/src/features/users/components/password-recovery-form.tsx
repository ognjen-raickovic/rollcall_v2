import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { emailSchema } from '../api/auth-api'
import { authConfigurationError } from '../api/auth-client'
import { usePasswordRecovery } from '../api/use-auth'
import { AuthField } from './auth-fields'
import { AuthShell } from './auth-shell'

const schema = z.object({ email: emailSchema })

export function PasswordRecoveryForm() {
  const recovery = usePasswordRecovery()
  const configuration = authConfigurationError()
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })
  return (
    <AuthShell title="A fresh start." description="Request a password reset link for your RollCall account.">
      <form
        noValidate
        className="space-y-6"
        onSubmit={form.handleSubmit(({ email }) => recovery.mutate(email))}
      >
        {configuration && (
          <p role="alert" className="text-sm text-destructive">
            {configuration}
          </p>
        )}
        <AuthField
          id="recovery-email"
          label="Email"
          type="email"
          autoComplete="email"
          registration={form.register('email')}
          error={form.formState.errors.email?.message}
        />
        {recovery.isSuccess && (
          <p role="status" className="text-sm text-muted-foreground">
            If an account exists for this address, a reset link has been sent. Open it in this browser to
            choose a new password.
          </p>
        )}
        {recovery.error && (
          <p role="alert" className="text-sm text-destructive">
            {recovery.error.message}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={Boolean(configuration) || recovery.isPending}>
          {recovery.isPending ? 'Sending link...' : 'Send reset link'}
        </Button>
        <Link className="block text-sm text-primary hover:underline" to="/login">
          Back to login
        </Link>
      </form>
    </AuthShell>
  )
}
