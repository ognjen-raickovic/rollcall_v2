import { createClient } from '@supabase/supabase-js'
import type { Environment } from '../config/env.js'
import type { Database } from './database.types.js'

export function createDatabaseClient(env: Environment, fetcher: typeof fetch = fetch, accessToken?: string) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
      fetch: (input, init) => {
        const timeout = AbortSignal.timeout(env.SUPABASE_TIMEOUT_MS)
        const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
        return fetcher(input, { ...init, signal })
      },
    },
  })
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>
