import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createAuthGuard } from '../auth/auth-guard.js'
import type { TokenVerifier } from '../auth/types.js'
import { unauthenticated } from '../auth/token-verifier.js'
import { parseInput } from '../../shared/api-error.js'
import {
  experienceInputSchema,
  gameIdSchema,
  noQuerySchema,
  profileIdSchema,
  profilePatchSchema,
  replaceExperienceSchema,
} from './profile-schema.js'
import type { ProfileRepository } from './types.js'

export function registerProfileRoutes(
  app: FastifyInstance,
  options: {
    verify: TokenVerifier
    repository: (accessToken?: string) => ProfileRepository
  },
): void {
  const guard = createAuthGuard(options.verify)
  function own(request: FastifyRequest): ProfileRepository {
    if (!request.account) throw unauthenticated()
    // The guard has already validated this exact bearer value. Each call creates a fresh
    // stateless client; identity and Data API JWT never enter a shared mutable session.
    const token = request.headers.authorization?.slice(7)
    if (!token) throw unauthenticated()
    return options.repository(token)
  }
  app.get('/api/me/profile', { preHandler: guard }, async (request) => {
    parseInput(noQuerySchema, request.query)
    return own(request).getOwn()
  })
  app.patch('/api/me/profile', { preHandler: guard }, async (request) => {
    parseInput(noQuerySchema, request.query)
    return own(request).updateOwn(parseInput(profilePatchSchema, request.body))
  })
  app.get('/api/me/game-experience', { preHandler: guard }, async (request) => {
    parseInput(noQuerySchema, request.query)
    if (!request.account) throw unauthenticated()
    return own(request).getExperience(request.account.id)
  })
  app.put('/api/me/game-experience/:gameId', { preHandler: guard }, async (request) => {
    parseInput(noQuerySchema, request.query)
    const { gameId } = parseInput(gameIdSchema, request.params)
    const { experience } = parseInput(experienceInputSchema, request.body)
    return own(request).setExperience(gameId, experience)
  })
  app.put('/api/me/game-experience', { preHandler: guard }, async (request) => {
    parseInput(noQuerySchema, request.query)
    return own(request).replaceExperience(parseInput(replaceExperienceSchema, request.body))
  })
  app.delete('/api/me/game-experience/:gameId', { preHandler: guard }, async (request, reply) => {
    parseInput(noQuerySchema, request.query)
    const { gameId } = parseInput(gameIdSchema, request.params)
    await own(request).removeExperience(gameId)
    return reply.code(204).send()
  })
  app.get('/api/users/:userId', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    parseInput(noQuerySchema, request.query)
    const { userId } = parseInput(profileIdSchema, request.params)
    return options.repository().getPublic(userId)
  })
  app.get('/api/games', async (request) => {
    parseInput(noQuerySchema, request.query)
    return options.repository().listGames()
  })
}
