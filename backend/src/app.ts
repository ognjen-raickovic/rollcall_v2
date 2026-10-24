import Fastify from 'fastify'
import type { Environment } from './config/env.js'
import { createDatabaseClient } from './db/supabase.js'
import { installErrorHandler } from './middleware/error-handler.js'
import { createGeographyRepository } from './modules/geography/geography-repository.js'
import { registerGeographyRoutes } from './modules/geography/geography-routes.js'
import type { GeographyRepository } from './modules/geography/types.js'

export function buildApp(
  env: Environment,
  options: { geography?: GeographyRepository; logger?: boolean } = {},
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
  app.get('/health', async () => ({ status: 'ok', service: 'rollcall-api' }))
  const repository = options.geography ?? createGeographyRepository(createDatabaseClient(env))
  registerGeographyRoutes(app, repository, {
    defaultLimit: env.CITY_SEARCH_DEFAULT_LIMIT,
    maximumLimit: env.CITY_SEARCH_MAX_LIMIT,
  })
  return app
}
