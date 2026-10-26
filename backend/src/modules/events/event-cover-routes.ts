import type { FastifyInstance, FastifyRequest } from 'fastify'
import type {} from '@fastify/multipart'
import { createAuthGuard } from '../auth/auth-guard.js'
import { unauthenticated } from '../auth/token-verifier.js'
import type { TokenVerifier } from '../auth/types.js'
import { ApiError, parseInput } from '../../shared/api-error.js'
import { attendanceBodySchema, eventIdSchema, noQuerySchema } from './event-schema.js'
import { invalidCover, MAX_COVER_BYTES } from './event-cover-image.js'
import type { EventCoverRepository } from './event-cover-repository.js'

export function registerEventCoverRoutes(
  app: FastifyInstance,
  options: {
    verify: TokenVerifier
    repository: (accessToken?: string) => EventCoverRepository
  },
): void {
  const guard = createAuthGuard(options.verify)
  function authenticated(request: FastifyRequest) {
    const token = request.headers.authorization?.slice(7)
    if (!request.account || !token) throw unauthenticated()
    return {
      actorId: request.account.id,
      repository: options.repository(token),
    }
  }
  app.post(
    '/api/events/:eventId/cover',
    { preHandler: guard, bodyLimit: MAX_COVER_BYTES + 65536 },
    async (request) => {
      parseInput(noQuerySchema, request.query)
      const { eventId } = parseInput(eventIdSchema, request.params)
      if (!request.isMultipart()) throw invalidCover('Select one image file to upload.')
      let source: { buffer: Buffer; mimeType: string; filename: string } | undefined
      try {
        for await (const part of request.parts({
          limits: { files: 1, fields: 0, parts: 1, fileSize: MAX_COVER_BYTES },
        })) {
          if (part.type !== 'file' || part.fieldname !== 'file' || source)
            throw invalidCover('Upload exactly one image using the file field.')
          source = {
            buffer: await part.toBuffer(),
            mimeType: part.mimetype,
            filename: part.filename,
          }
          if (part.file.truncated) throw invalidCover('Choose an image no larger than 3 MiB.', 413)
        }
      } catch (error) {
        if (error instanceof ApiError) throw error
        if (error instanceof app.multipartErrors.RequestFileTooLargeError)
          throw invalidCover('Choose an image no larger than 3 MiB.', 413)
        throw invalidCover('Upload exactly one JPEG, PNG or WebP file, no larger than 3 MiB.')
      }
      if (!source) throw invalidCover('Select one image file to upload.')
      const { repository, actorId } = authenticated(request)
      return repository.upload(eventId, actorId, source)
    },
  )
  app.delete('/api/events/:eventId/cover', { preHandler: guard }, async (request) => {
    parseInput(noQuerySchema, request.query)
    parseInput(attendanceBodySchema, request.body)
    const { eventId } = parseInput(eventIdSchema, request.params)
    const { repository, actorId } = authenticated(request)
    return repository.remove(eventId, actorId)
  })
  app.post('/api/events/:eventId/cover/cleanup', { preHandler: guard }, async (request) => {
    parseInput(noQuerySchema, request.query)
    parseInput(attendanceBodySchema, request.body)
    const { eventId } = parseInput(eventIdSchema, request.params)
    // SQL rechecks the retained manifest owner, including after event deletion.
    return {
      eventId,
      cleanupPending: await authenticated(request).repository.cleanup(eventId),
    }
  })
  app.get(
    '/api/events/:eventId/cover-url',
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
      const token = request.account ? request.headers.authorization?.slice(7) : undefined
      return options.repository(token).getUrl(eventId)
    },
  )
}
