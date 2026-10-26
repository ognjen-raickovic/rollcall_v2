import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify'
import { z } from 'zod'
import { ApiError, parseInput } from '../../shared/api-error.js'
import { createAuthGuard } from '../auth/auth-guard.js'
import type { TokenVerifier } from '../auth/types.js'
import type { AdminRepository } from './admin-repository.js'

export function requireCapability(
  repository: (request: FastifyRequest) => AdminRepository,
  capability: 'accessAdmin' | 'manageAdminRoles',
): preHandlerHookHandler {
  return async (request) => {
    const permissions = await repository(request).permissions()
    if (!permissions.capabilities[capability])
      throw new ApiError(403, 'FORBIDDEN', 'You do not have permission for this action.')
  }
}
export function registerAdminRoutes(
  app: FastifyInstance,
  options: {
    verify: TokenVerifier
    repository: (token: string) => AdminRepository
  },
) {
  const auth = createAuthGuard(options.verify)
  const repository = (request: FastifyRequest) =>
    options.repository(request.headers.authorization?.slice(7) ?? '')
  const manage = requireCapability(repository, 'manageAdminRoles')
  const empty = z.strictObject({})
  const limit = z.coerce.number().int().min(1).max(50).default(20)
  app.get('/api/me/permissions', { preHandler: auth }, async (request) => {
    parseInput(empty, request.query)
    return repository(request).permissions()
  })
  app.get('/api/admin/users', { preHandler: [auth, manage] }, async (request) => {
    const query = parseInput(
      z.strictObject({
        limit,
        after: z.uuid().optional(),
        userId: z.uuid().optional(),
      }),
      request.query,
    )
    return repository(request).users(query.limit, query.after, query.userId)
  })
  app.patch('/api/admin/users/:userId/role', { preHandler: [auth, manage] }, async (request) => {
    parseInput(empty, request.query)
    const { userId } = parseInput(z.strictObject({ userId: z.uuid() }), request.params)
    const { role } = parseInput(z.strictObject({ role: z.enum(['user', 'admin']) }), request.body)
    return repository(request).changeRole(userId, role)
  })
  app.get('/api/admin/role-audit', { preHandler: [auth, manage] }, async (request) => {
    const query = parseInput(
      z.strictObject({
        limit,
        before: z
          .string()
          .regex(/^[1-9]\d{0,18}$/)
          .refine((v) => BigInt(v) <= 9223372036854775807n)
          .optional(),
        targetId: z.uuid().optional(),
      }),
      request.query,
    )
    return repository(request).audit(query.limit, query.before, query.targetId)
  })
}
