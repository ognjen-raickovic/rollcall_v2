import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Environment } from '../../config/env.js'
import { createDatabaseClient } from '../../db/supabase.js'
import { ApiError, parseInput } from '../../shared/api-error.js'
import { createAuthGuard } from '../auth/auth-guard.js'
import { readAccountStatus, throwIfSuspended } from '../auth/account-status.js'
import type { TokenVerifier } from '../auth/types.js'
const status = z.enum(['active', 'suspended'])
const reason = z
  .string()
  .trim()
  .min(5)
  .max(500)
  .refine(
    (value) => Array.from(value).every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
    'Use a short reason on one line.',
  )
async function result<T>(
  response: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
  schema: z.ZodType<T>,
) {
  const value = await response
  throwIfSuspended(value.error)
  if (value.error) {
    if (value.error.code === '42501')
      throw new ApiError(403, 'FORBIDDEN', 'You cannot manage this account’s access.')
    if (value.error.code === 'P0002') throw new ApiError(404, 'NOT_FOUND', 'Account not found.')
    if (value.error.code === '22023')
      throw new ApiError(400, 'VALIDATION_ERROR', 'Check the account and internal reason.')
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Account access management is temporarily unavailable.')
  }
  const parsed = schema.safeParse(value.data)
  if (!parsed.success)
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Account access management is temporarily unavailable.')
  return parsed.data
}
export function registerSuspensionRoutes(app: FastifyInstance, env: Environment, verify: TokenVerifier) {
  const auth = createAuthGuard(verify),
    empty = z.strictObject({}),
    client = (token?: string) => createDatabaseClient(env, fetch, token?.slice(7))
  app.get('/api/me/account-status', { preHandler: createAuthGuard(verify, true) }, async (request) => {
    parseInput(empty, request.query)
    return readAccountStatus(client(request.headers.authorization))
  })
  app.get('/api/admin/account-lookup', { preHandler: auth }, async (request) => {
    const { userId } = parseInput(z.strictObject({ userId: z.uuid() }), request.query)
    return result(
      client(request.headers.authorization).rpc('suspension_account', { p_target: userId }),
      z.object({
        id: z.uuid(),
        displayName: z.string(),
        role: z.enum(['user', 'admin', 'superadmin']),
        status,
        canManage: z.boolean(),
      }),
    )
  })
  for (const [method, suspend] of [
    ['POST', true],
    ['DELETE', false],
  ] as const) {
    app.route({
      method,
      url: '/api/admin/users/:userId/suspension',
      preHandler: auth,
      handler: async (request) => {
        parseInput(empty, request.query)
        const { userId } = parseInput(z.strictObject({ userId: z.uuid() }), request.params),
          body = parseInput(z.strictObject({ reason }), request.body)
        return result(
          client(request.headers.authorization).rpc('change_account_suspension', {
            p_target: userId,
            p_suspend: suspend,
            p_reason: body.reason,
          }),
          z.object({ id: z.uuid(), status, changed: z.boolean() }),
        )
      },
    })
  }
  app.get('/api/admin/suspension-audit', { preHandler: auth }, async (request) => {
    const query = parseInput(
      z.strictObject({
        targetId: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        before: z
          .string()
          .regex(/^[1-9]\d{0,18}$/)
          .refine((v) => BigInt(v) <= 9223372036854775807n)
          .optional(),
      }),
      request.query,
    )
    return result(
      client(request.headers.authorization).rpc('get_suspension_audit', {
        p_limit: query.limit,
        ...(query.targetId ? { p_target: query.targetId } : {}),
        ...(query.before ? { p_before: query.before } : {}),
      }),
      z.object({
        items: z
          .array(
            z.object({
              id: z.string(),
              actorId: z.uuid(),
              targetId: z.uuid(),
              action: z.enum(['suspend', 'reinstate']),
              previousStatus: status,
              newStatus: status,
              reason: z.string(),
              createdAt: z.string(),
            }),
          )
          .max(50),
        nextCursor: z.string().nullable(),
      }),
    )
  })
}
