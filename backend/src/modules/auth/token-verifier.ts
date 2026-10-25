import { z } from 'zod'
import type { Environment } from '../../config/env.js'
import { createDatabaseClient } from '../../db/supabase.js'
import { ApiError } from '../../shared/api-error.js'
import type { TokenVerifier } from './types.js'

const claimsSchema = z.object({
  sub: z.uuid(),
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number().int(),
  nbf: z.number().int().optional(),
  role: z.literal('authenticated'),
  email: z.email().optional(),
  is_anonymous: z.boolean().optional(),
})

export function unauthenticated(): ApiError {
  return new ApiError(401, 'UNAUTHENTICATED', 'Sign in with a valid account to continue.')
}

export function createTokenVerifier(env: Environment, fetcher: typeof fetch = fetch): TokenVerifier {
  const issuer = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`
  // This stateless client is never signed in or assigned a caller's session. getClaims(jwt)
  // verifies asymmetric signatures with JWKS; legacy symmetric tokens go to Auth.getUser.
  const client = createDatabaseClient(env, fetcher)
  return async (accessToken) => {
    try {
      const { data, error } = await client.auth.getClaims(accessToken)
      if (error || !data) throw unauthenticated()
      const parsed = claimsSchema.safeParse(data.claims)
      if (!parsed.success) throw unauthenticated()
      const claims = parsed.data
      const now = Math.floor(Date.now() / 1000)
      const audiences = typeof claims.aud === 'string' ? [claims.aud] : claims.aud
      if (
        claims.iss !== issuer ||
        !audiences.includes('authenticated') ||
        claims.exp <= now ||
        (claims.nbf !== undefined && claims.nbf > now) ||
        claims.is_anonymous === true
      ) {
        throw unauthenticated()
      }
      return { id: claims.sub, email: claims.email ?? null }
    } catch {
      // Never include tokens, upstream responses or cryptographic diagnostics in errors.
      throw unauthenticated()
    }
  }
}
