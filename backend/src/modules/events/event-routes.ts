import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createAuthGuard } from '../auth/auth-guard.js'
import type { TokenVerifier } from '../auth/types.js'
import { unauthenticated } from '../auth/token-verifier.js'
import { parseInput } from '../../shared/api-error.js'
import {
  eventDiscoverySchema,
  eventIdSchema,
  newEventSchema,
  noQuerySchema,
  updateEventSchema,
} from './event-schema.js'
import type { EventRepository } from './types.js'

export function registerEventRoutes(
  app: FastifyInstance,
  options: {
    verify: TokenVerifier
    repository: (accessToken?: string) => EventRepository
  },
): void {
  const guard = createAuthGuard(options.verify)
  function authenticated(request: FastifyRequest): { repository: EventRepository; accountId: string } {
    const token = request.headers.authorization?.slice(7)
    if (!request.account || !token) throw unauthenticated()
    return { repository: options.repository(token), accountId: request.account.id }
  }
  app.get('/api/events', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    // Discovery remains public even when a caller happens to send an account token.
    return options.repository().list(parseInput(eventDiscoverySchema, request.query))
  })
  app.get(
    '/api/events/:eventId',
    {
      preHandler: async (request, reply) => {
        reply.header('Cache-Control', 'no-store')
        reply.header('Vary', 'Authorization')
        if (request.headers.authorization !== undefined) await guard.call(app, request, reply, () => {})
      },
    },
    async (request) => {
      parseInput(noQuerySchema, request.query)
      const { eventId } = parseInput(eventIdSchema, request.params)
      if (request.account) {
        const { repository, accountId } = authenticated(request)
        return repository.get(eventId, accountId)
      }
      return options.repository().get(eventId)
    },
  )
  app.post('/api/events', { preHandler: guard }, async (request, reply) => {
    parseInput(noQuerySchema, request.query)
    const input = parseInput(newEventSchema, request.body)
    const { repository, accountId } = authenticated(request)
    const event = await repository.create(input, accountId)
    return reply.code(201).header('Location', `/api/events/${event.id}`).send(event)
  })
  app.patch('/api/events/:eventId', { preHandler: guard }, async (request) => {
    parseInput(noQuerySchema, request.query)
    const { eventId } = parseInput(eventIdSchema, request.params)
    const patch = parseInput(updateEventSchema, request.body)
    const { repository, accountId } = authenticated(request)
    return repository.update(eventId, patch, accountId)
  })
  app.delete('/api/events/:eventId', { preHandler: guard }, async (request, reply) => {
    parseInput(noQuerySchema, request.query)
    const { eventId } = parseInput(eventIdSchema, request.params)
    await authenticated(request).repository.remove(eventId)
    return reply.code(204).send()
  })
}
