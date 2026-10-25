import Fastify from 'fastify'
import type { Environment } from './config/env.js'
import { createDatabaseClient } from './db/supabase.js'
import { installErrorHandler } from './middleware/error-handler.js'
import { createGeographyRepository } from './modules/geography/geography-repository.js'
import { registerGeographyRoutes } from './modules/geography/geography-routes.js'
import type { GeographyRepository } from './modules/geography/types.js'
import { registerAuthRoutes } from './modules/auth/auth-routes.js'
import { createTokenVerifier } from './modules/auth/token-verifier.js'
import type { TokenVerifier } from './modules/auth/types.js'
import { registerProfileRoutes } from './modules/profiles/profile-routes.js'
import { createProfileRepository } from './modules/profiles/profile-repository.js'
import type { ProfileRepository } from './modules/profiles/types.js'
import { registerEventRoutes } from './modules/events/event-routes.js'
import { createEventRepository } from './modules/events/event-repository.js'
import type { EventRepository } from './modules/events/types.js'

export function buildApp(
  env: Environment,
  options: {
    geography?: GeographyRepository
    verifyToken?: TokenVerifier
    profiles?: (accessToken?: string) => ProfileRepository
    events?: (accessToken?: string) => EventRepository
    logger?: boolean
  } = {},
) {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: [
              'req.headers.authorization',
              'req.headers.apikey',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
            ],
            serializers: {
              req: (request) => ({ method: request.method, path: request.url?.split('?')[0] }),
            },
          },
    bodyLimit: 16384,
    requestTimeout: 10000,
    trustProxy: false,
  })
  installErrorHandler(app)
  const verify = options.verifyToken ?? createTokenVerifier(env)
  registerAuthRoutes(app, verify)
  registerProfileRoutes(app, {
    verify,
    repository:
      options.profiles ?? ((token) => createProfileRepository(createDatabaseClient(env, fetch, token))),
  })
  registerEventRoutes(app, {
    verify,
    repository:
      options.events ?? ((token) => createEventRepository(createDatabaseClient(env, fetch, token))),
  })
  app.get('/health', async () => ({ status: 'ok', service: 'rollcall-api' }))
  const repository = options.geography ?? createGeographyRepository(createDatabaseClient(env))
  registerGeographyRoutes(app, repository, {
    defaultLimit: env.CITY_SEARCH_DEFAULT_LIMIT,
    maximumLimit: env.CITY_SEARCH_MAX_LIMIT,
  })
  return app
}
