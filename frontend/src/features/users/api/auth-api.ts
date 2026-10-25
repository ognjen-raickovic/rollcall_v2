import { z } from 'zod'
import type { Session } from '@supabase/supabase-js'

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

function errorMessage(error: { code?: string; message?: string }): Error {
  switch (error.code) {
    case 'invalid_credentials':
      return new Error('Email or password is incorrect.')
    case 'email_not_confirmed':
      return new Error(
        'Confirm your email before logging in. Check your inbox or request another confirmation below.',
      )
    case 'user_already_exists':
    case 'email_exists':
      return new Error('This account could not be registered. Try logging in or resetting your password.')
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return new Error('Too many attempts. Please wait a moment before trying again.')
    case 'same_password':
      return new Error('Choose a password different from your previous password.')
    case 'weak_password':
      return new Error('Choose a stronger password with at least 8 characters.')
    default:
      return new Error(
        'Authentication could not be completed. Check your connection and try again. Email links may have expired; request a new one if needed.',
      )
  }
}

function callback(path: string): string {
  return new URL(path, window.location.origin).href
}

export const authApi = {
  get: async (): Promise<Account | null> => {
    if (authConfigurationError()) return null
    const { data, error } = await authClient().auth.getSession()
    if (error) throw errorMessage(error)
    return sessionAccount(data.session)
  },
  login: async ({ email, password }: { email: string; password: string }): Promise<Account | null> => {
    await sessionApi.logout()
    const { data, error } = await authClient().auth.signInWithPassword({
      email: emailSchema.parse(email.trim()),
      password,
    })
    if (error) throw errorMessage(error)
    return sessionAccount(data.session)
  },
  register: async ({ email, password }: { email: string; password: string }) => {
    await sessionApi.logout()
    const { data, error } = await authClient().auth.signUp({
      email: emailSchema.parse(email.trim()),
      password: passwordSchema.parse(password),
      options: { emailRedirectTo: callback('/auth/callback') },
    })
    if (error) throw errorMessage(error)
    return { account: sessionAccount(data.session), confirmationRequired: !data.session }
  },
  logout: async () => {
    const { error } = await authClient().auth.signOut({ scope: 'local' })
    if (error) throw errorMessage(error)
    await sessionApi.logout()
    return null
  },
  recover: async (email: string) => {
    const { error } = await authClient().auth.resetPasswordForEmail(emailSchema.parse(email.trim()), {
      redirectTo: callback('/reset-password'),
    })
    if (error) throw errorMessage(error)
  },
  resend: async (email: string) => {
    const { error } = await authClient().auth.resend({
      type: 'signup',
      email: emailSchema.parse(email.trim()),
      options: { emailRedirectTo: callback('/auth/callback') },
    })
    if (error) throw errorMessage(error)
  },
  updatePassword: async (password: string) => {
    const { error } = await authClient().auth.updateUser({ password: passwordSchema.parse(password) })
    if (error) throw errorMessage(error)
    // End the recovery session; use the new password to sign in explicitly.
    const result = await authClient().auth.signOut({ scope: 'local' })
    if (result.error) throw errorMessage(result.error)
  },
  me: async (signal?: AbortSignal): Promise<Account> => {
    const { data, error } = await authClient().auth.getSession()
    if (error || !data.session) throw new Error('Log in to check your account.')
    const configured = (import.meta.env.VITE_API_ORIGIN ?? '').trim()
    const origin = configured ? new URL(configured) : new URL(window.location.origin)
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      throw new Error('The API origin is invalid.')
    const response = await fetch(new URL('/api/me', origin), {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? 'Your account could not be verified. Log out and log in again.'
          : 'The account service is unavailable. Please try again.',
      )
    const account = accountSchema.parse(await response.json())
    if (account.id !== data.session.user.id)
      throw new Error('Your account could not be verified. Log out and log in again.')
    return account
  },
}
