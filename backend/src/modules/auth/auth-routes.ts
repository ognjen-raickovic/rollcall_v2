import type { FastifyInstance } from 'fastify'
import { createAuthGuard } from './auth-guard.js'
import { unauthenticated } from './token-verifier.js'
import type { TokenVerifier } from './types.js'

export function registerAuthRoutes(app: FastifyInstance, verify: TokenVerifier): void {
  app.decorateRequest('account', null)
  app.get('/api/me', { preHandler: createAuthGuard(verify) }, async (request) => {
    if (!request.account) throw unauthenticated()
    return { id: request.account.id, email: request.account.email }
  })
}
