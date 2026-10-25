import type { preHandlerHookHandler } from 'fastify'
import type { AccountIdentity, TokenVerifier } from './types.js'
import { unauthenticated } from './token-verifier.js'

declare module 'fastify' {
  interface FastifyRequest {
    account: AccountIdentity | null
  }
}

export function createAuthGuard(verify: TokenVerifier): preHandlerHookHandler {
  return async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    reply.header('Vary', 'Authorization')
    const authorization = request.headers.authorization
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i)
    const token = match?.[1]
    if (!token || token.length > 16384) {
      reply.header('WWW-Authenticate', 'Bearer')
      throw unauthenticated()
    }
    try {
      request.account = await verify(token)
    } catch {
      reply.header('WWW-Authenticate', 'Bearer error="invalid_token"')
      throw unauthenticated()
    }
  }
}
