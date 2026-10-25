import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

export const demoModeEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_MODE === 'true'

export function authConfigurationError(): string | null {
  try {
    const url = new URL(import.meta.env.VITE_SUPABASE_URL ?? '')
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return 'Use a Supabase HTTP(S) origin without a path or credentials.'
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
    if (key.startsWith('sb_publishable_')) return null
    const payload: unknown = JSON.parse(atob((key.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')))
    if (typeof payload === 'object' && payload !== null && 'role' in payload && payload.role === 'anon')
      return null
    return 'Use only a Supabase publishable or legacy anon key in the frontend.'
  } catch {
    return 'Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for local Supabase.'
  }
}

export function authClient(): SupabaseClient {
  const error = authConfigurationError()
  if (error) throw new Error(error)
  client ??= createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'rollcall.auth',
    },
  })
  return client
}
