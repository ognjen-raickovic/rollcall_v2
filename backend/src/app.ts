import Fastify from 'fastify'
import { createDiscussionRepository, registerDiscussionRoutes, type DiscussionRepository } from './modules/events/event-discussion.js'
import { registerRegistrationRoutes } from './modules/auth/registration.js'
import multipart from '@fastify/multipart'
import { registerInvitationRoutes } from './modules/events/event-invitations.js'
import type { Environment } from './config/env.js'
import { registerAdminRoutes } from './modules/administration/admin-routes.js'
import { registerModerationRoutes } from './modules/moderation/moderation-routes.js'
import { registerSuspensionRoutes } from './modules/administration/suspension-routes.js'
import { readAccountStatus,suspendedError } from './modules/auth/account-status.js'
import { createAdminRepository } from './modules/administration/admin-repository.js'
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
import { registerPersonalEventRoutes } from './modules/events/personal-event-routes.js'
import { createEventRepository } from './modules/events/event-repository.js'
import type { EventRepository } from './modules/events/types.js'
import { registerEventCoverRoutes } from './modules/events/event-cover-routes.js'
import {
  createEventCoverRepository,
  type EventCoverRepository,
} from './modules/events/event-cover-repository.js'

export function buildApp(
  env: Environment,
  options: {
    geography?: GeographyRepository
    verifyToken?: TokenVerifier
    profiles?: (accessToken?: string) => ProfileRepository
    events?: (accessToken?: string) => EventRepository
    covers?: (accessToken?: string) => EventCoverRepository
    logger?: boolean
    discussion?: (accessToken?: string) => DiscussionRepository
    assertActiveAccount?: (token:string)=>Promise<void>
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
              'req.headers["x-rollcall-cover-key"]',
              'res.headers["set-cookie"]',
            ],
            serializers: {
              req: (request) => ({ method: request.method, path: request.url?.split('?')[0] }),
            },
          },
    bodyLimit: 16384,
    requestTimeout: 20000,
    trustProxy: false,
  })
  installErrorHandler(app)
  registerRegistrationRoutes(app, env)
  app.decorate('assertActiveAccount',options.assertActiveAccount??(async(token:string)=>{
    const status=await readAccountStatus(createDatabaseClient(env,fetch,token))
    if(status.status==='suspended')throw suspendedError()
  }))
  void app.register(multipart, { limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0, parts: 1 } })
  const verify = options.verifyToken ?? createTokenVerifier(env)
  const covers = options.covers ?? ((token?: string) => createEventCoverRepository(env, token))
  registerAuthRoutes(app, verify)
  registerDiscussionRoutes(app, { verify, repository: options.discussion ?? ((token) => createDiscussionRepository(createDatabaseClient(env, fetch, token))) })
  registerPersonalEventRoutes(app,env,verify)
  registerSuspensionRoutes(app,env,verify)
  registerAdminRoutes(app, { verify, repository: (token) => createAdminRepository(createDatabaseClient(env, fetch, token)) })
  registerProfileRoutes(app, {
    verify,
    repository:
      options.profiles ?? ((token) => createProfileRepository(createDatabaseClient(env, fetch, token))),
  })
  registerEventRoutes(app, {
    verify,
    cleanupCover: (eventId, token) => covers(token).cleanup(eventId),
    repository: options.events ?? ((token) => createEventRepository(createDatabaseClient(env, fetch, token))),
  })
  registerEventCoverRoutes(app, { verify, repository: covers })
  registerInvitationRoutes(app, env, verify)
  registerModerationRoutes(app, env, verify)
  app.get('/health', async () => ({ status: 'ok', service: 'rollcall-api' }))
  const repository = options.geography ?? createGeographyRepository(createDatabaseClient(env))
  registerGeographyRoutes(app, repository, {
    defaultLimit: env.CITY_SEARCH_DEFAULT_LIMIT,
    maximumLimit: env.CITY_SEARCH_MAX_LIMIT,
  })
  return app
}
