import type { FastifyInstance } from 'fastify'
import type { Environment } from '../../config/env.js'
import { createDatabaseClient } from '../../db/supabase.js'
import { parseInput } from '../../shared/api-error.js'
import { createAuthGuard } from '../auth/auth-guard.js'
import type { TokenVerifier } from '../auth/types.js'
import { requireCapability } from '../administration/admin-routes.js'
import { createAdminRepository } from '../administration/admin-repository.js'
import { eventIdSchema, noQuerySchema } from '../events/event-schema.js'
import { createModerationRepository } from './moderation-repository.js'
import { reportInputSchema, reportIdSchema, reportListSchema, decisionSchema } from './moderation-schema.js'
export function registerModerationRoutes(app: FastifyInstance, env: Environment, verify: TokenVerifier) {
  const auth = createAuthGuard(verify)
  const database = (authorization: string | undefined) =>
    createDatabaseClient(env, fetch, authorization?.slice(7))
  const moderate = requireCapability(
    (request) => createAdminRepository(database(request.headers.authorization)),
    'accessAdmin',
  )
  app.post('/api/events/:eventId/reports', { preHandler: auth }, async (request, reply) => {
    parseInput(noQuerySchema, request.query)
    const { eventId } = parseInput(eventIdSchema, request.params),
      input = parseInput(reportInputSchema, request.body)
    try {
      const result = await createModerationRepository(database(request.headers.authorization)).submit(
        eventId,
        input,
      )
      return reply.code(result.created ? 201 : 200).send(result)
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 429)
        reply.header('Retry-After', '900')
      throw error
    }
  })
  app.get('/api/admin/event-reports', { preHandler: [auth, moderate] }, async (request) =>
    createModerationRepository(database(request.headers.authorization)).list(
      parseInput(reportListSchema, request.query),
    ),
  )
  app.get('/api/admin/event-reports/:reportId', { preHandler: [auth, moderate] }, async (request) => {
    parseInput(noQuerySchema, request.query)
    const { reportId } = parseInput(reportIdSchema, request.params)
    return createModerationRepository(database(request.headers.authorization)).get(reportId)
  })
  for (const [suffix, action] of [
    ['dismiss', 'dismiss'],
    ['take-action', 'cancel_event'],
  ] as const) {
    app.post(
      `/api/admin/event-reports/:reportId/${suffix}`,
      { preHandler: [auth, moderate] },
      async (request) => {
        parseInput(noQuerySchema, request.query)
        const { reportId } = parseInput(reportIdSchema, request.params),
          { note } = parseInput(decisionSchema, request.body)
        return createModerationRepository(database(request.headers.authorization)).resolve(
          reportId,
          action,
          note,
        )
      },
    )
  }
}
