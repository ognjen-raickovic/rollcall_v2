import type { FastifyInstance } from 'fastify'
import { ApiError } from '../shared/api-error.js'

export function installErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      code: 'NOT_FOUND',
      message: 'This API route does not exist.',
      fields: {},
    }),
  )

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      if (error.status >= 500) request.log.warn({ code: error.code }, 'API dependency unavailable')
      return reply.code(error.status).send({ code: error.code, message: error.message, fields: error.fields })
    }
    const status =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500
    if (status >= 400 && status < 500) {
      return reply.code(status).send({
        code: 'VALIDATION_ERROR',
        message: 'The request could not be processed.',
        fields: {},
      })
    }
    // Upstream errors may contain secrets or private values; log only the correlation ID.
    request.log.error({ code: 'INTERNAL_ERROR' }, 'Unexpected API failure')
    return reply
      .code(500)
      .send({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', fields: {} })
  })
}
