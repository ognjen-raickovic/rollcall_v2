import { z } from 'zod'
import type { Session } from '@supabase/supabase-js'
import { HttpError, httpRequest } from '@/lib/http-client'
import { safeReturnTo } from '@/lib/auth-navigation'
import { authError } from './auth-errors'

import type { Account } from '../types'
import { authClient, authConfigurationError } from './auth-client'
import { sessionApi } from './session-api'

export const accountSchema = z.object({ id: z.uuid(), email: z.string().nullable() })
export const emailSchema = z.email('Enter a valid email address.').max(254)
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Use at most 72 characters.')

export function sessionAccount(session: Session | null): Account | null {
  return session ? accountSchema.parse({ id: session.user.id, email: session.user.email ?? null }) : null
}

function callback(path: string): string {
  return new URL(path, window.location.origin).href
}

export const authApi = {
  accessToken: async (expectedUserId: string | null): Promise<string | null> => {
    if (authConfigurationError()) {
      if (expectedUserId === null) return null
      throw new HttpError(401, 'Your session could not be verified. Log in again to continue.')
    }
    const { data, error } = await authClient().auth.getSession()
    if (error || (data.session?.user.id ?? null) !== expectedUserId)
      throw new HttpError(401, 'Your account changed. Log in again or reload this page.')
    return data.session?.access_token ?? null
  },
  get: async (): Promise<Account | null> => {
    if (authConfigurationError()) return null
    const { data, error } = await authClient().auth.getSession()
    if (error) throw authError(error)
    return sessionAccount(data.session)
  },
  login: async ({ email, password }: { email: string; password: string }): Promise<Account | null> => {
    await sessionApi.logout()
    const { data, error } = await authClient().auth.signInWithPassword({
      email: emailSchema.parse(email.trim()),
      password,
    })
    if (error) throw authError(error)
    return sessionAccount(data.session)
  },
  register: async ({
    email,
    password,
    username,
    dateOfBirth,
    returnTo,
  }: {
    email: string
    password: string
    username: string
    dateOfBirth: string
    returnTo?: string
  }) => {
    await sessionApi.logout()
    const intent = await httpRequest('/api/auth/registration-intent', z.object({ token: z.uuid() }), {
      resource: 'auth',
      method: 'POST',
      body: { username, email, dateOfBirth },
    })
    const { data, error } = await authClient().auth.signUp({
      email: emailSchema.parse(email.trim()),
      password: passwordSchema.parse(password),
      options: {
        emailRedirectTo: callback(
          '/auth/callback' + (returnTo ? `?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}` : ''),
        ),
        data: { rollcall_registration_token: intent.token },
      },
    })
    if (error) throw authError(error)
    return { account: sessionAccount(data.session), confirmationRequired: !data.session }
  },
  logout: async () => {
    const { error } = await authClient().auth.signOut({ scope: 'local' })
    if (error) throw authError(error)
    await sessionApi.logout()
    return null
  },
  recover: async (email: string) => {
    const { error } = await authClient().auth.resetPasswordForEmail(emailSchema.parse(email.trim()), {
      redirectTo: callback('/reset-password'),
    })
    if (error) throw authError(error)
  },
  resend: async (email: string) => {
    const { error } = await authClient().auth.resend({
      type: 'signup',
      email: emailSchema.parse(email.trim()),
      options: { emailRedirectTo: callback('/auth/callback') },
    })
    if (error) throw authError(error)
  },
  updatePassword: async (password: string) => {
    const { error } = await authClient().auth.updateUser({ password: passwordSchema.parse(password) })
    if (error) throw authError(error)
    // End the recovery session; use the new password to sign in explicitly.
    const result = await authClient().auth.signOut({ scope: 'local' })
    if (result.error) throw authError(result.error)
  },
  me: async (expectedUserId: string, signal?: AbortSignal): Promise<Account> => {
    const token = await authApi.accessToken(expectedUserId)
    if (!token) throw new HttpError(401, 'Log in to check your account.')
    const account = await httpRequest('/api/me', accountSchema, {
      token,
      signal,
      viewerId: expectedUserId,
      resource: 'auth',
    })
    if (signal?.aborted || account.id !== expectedUserId || !(await authApi.accessToken(expectedUserId)))
      throw new HttpError(401, 'Your account changed. Reload this page and try again.')
    return account
  },
}
