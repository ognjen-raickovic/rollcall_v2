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
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return null
    const payload: unknown = JSON.parse(atob((key.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')))
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'ref' in payload &&
      payload.ref !== url.hostname.split('.')[0] &&
      url.hostname.endsWith('.supabase.co')
    )
      return 'The legacy public key belongs to a different Supabase project. Rebuild with matching public configuration.'
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
    global: {
      fetch: async (input, init) => {
        const response = await fetch(input, init)
        // The gateway may identify an invalid key only in this response header.
        // Normalize that established error for the SDK without exposing its payload.
        if (
          response.status === 401 &&
          response.headers.get('sb-error-code') === 'UNAUTHORIZED_INVALID_API_KEY'
        ) {
          return Response.json(
            {
              code: 'UNAUTHORIZED_INVALID_API_KEY',
              error_code: 'UNAUTHORIZED_INVALID_API_KEY',
              message: 'API key rejected.',
            },
            { status: 401 },
          )
        }
        return response
      },
    },
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
