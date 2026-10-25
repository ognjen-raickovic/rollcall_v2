import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { passwordSchema } from '../api/auth-api'
import { useAuth, useRecoverySession, useUpdatePassword } from '../api/use-auth'
import { AuthField } from './auth-fields'
import { AuthShell } from './auth-shell'

const schema = z
  .object({ password: passwordSchema, confirmation: z.string() })
  .refine((value) => value.password === value.confirmation, {
    path: ['confirmation'],
    message: 'Passwords must match.',
  })

export function ResetPasswordForm() {
  const auth = useAuth()
  const recovery = useRecoverySession()
  const update = useUpdatePassword()
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmation: '' },
  })
  if (update.isSuccess) return <Navigate to="/login?passwordUpdated=true" replace />
  return (
    <AuthShell title="Choose a new password." description="Finish your password recovery, then log in again.">
      {auth.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking your reset link...
        </p>
      ) : !auth.data || !recovery.data ? (
        <div className="space-y-4">
          <p role="alert" className="text-sm text-muted-foreground">
            Open a valid password reset link from your email in the same browser where you requested it. The
            link may have expired or already been used.
          </p>
          <Button asChild>
            <Link to="/forgot-password">Request another link</Link>
          </Button>
        </div>
      ) : (
        <form
          noValidate
          className="space-y-6"
          onSubmit={form.handleSubmit(({ password }) => update.mutate(password))}
        >
          <AuthField
            id="reset-password"
            label="New password"
            type="password"
            autoComplete="new-password"
            registration={form.register('password')}
            error={form.formState.errors.password?.message}
          />
          <AuthField
            id="reset-confirmation"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            registration={form.register('confirmation')}
            error={form.formState.errors.confirmation?.message}
          />
          {update.error && (
            <p role="alert" className="text-sm text-destructive">
              {update.error.message}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={update.isPending}>
            {update.isPending ? 'Updating password...' : 'Update password'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
