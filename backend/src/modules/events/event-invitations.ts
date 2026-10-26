import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { Environment } from '../../config/env.js'
import type { Database } from '../../db/database.types.js'
import { ApiError, parseInput } from '../../shared/api-error.js'
import { createAuthGuard } from '../auth/auth-guard.js'
import type { TokenVerifier } from '../auth/types.js'
import { eventIdSchema, noQuerySchema, attendanceBodySchema } from './event-schema.js'
import { createEventRepository } from './event-repository.js'

const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export function normalizeInvitation(value: string): string {
  if (!/^[a-zA-Z2-9 -]{1,64}$/.test(value))
    throw new ApiError(400, 'VALIDATION_ERROR', 'Enter a valid 16-character room code.')
  const clean = value.toUpperCase().replace(/[ -]/g, '')
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16}$/.test(clean))
    throw new ApiError(400, 'VALIDATION_ERROR', 'Enter a valid 16-character room code.')
  return clean
}
export function invitationCrypto(secret: string) {
  const root = Buffer.from(secret, 'base64url')
  const encryption = Buffer.from(hkdfSync('sha256', root, '', 'rollcall-invitations-encryption-v1', 32))
  const verification = Buffer.from(hkdfSync('sha256', root, '', 'rollcall-invitations-verification-v1', 32))
  return {
    generate: () => Array.from(randomBytes(16), (byte) => alphabet[byte & 31]).join(''),
    hash: (code: string) => createHmac('sha256', verification).update(code).digest('hex'),
    seal(code: string, id: string) {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', encryption, iv)
      cipher.setAAD(Buffer.from(`rollcall-invitation:v1:${id}`))
      const bytes = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()])
      return [iv, cipher.getAuthTag(), bytes].map((value) => value.toString('base64url')).join('.')
    },
    open(sealed: string, id: string) {
      const [iv, tag, bytes] = sealed.split('.').map((value) => Buffer.from(value, 'base64url'))
      if (!iv || !tag || !bytes) throw new Error('Invalid encrypted invitation')
      const decipher = createDecipheriv('aes-256-gcm', encryption, iv)
      decipher.setAAD(Buffer.from(`rollcall-invitation:v1:${id}`))
      decipher.setAuthTag(tag)
      return normalizeInvitation(Buffer.concat([decipher.update(bytes), decipher.final()]).toString())
    },
  }
}
const stored = z.object({
  eventId: z.uuid(),
  sealedCode: z.string().max(100),
  expiresAt: z.iso.datetime({ offset: true }),
  revokedAt: z.iso.datetime({ offset: true }).nullable(),
})
const outcome = z.discriminatedUnion('status', [
  z.object({ status: z.literal('joined'), eventId: z.uuid() }),
  z.object({ status: z.literal('invalid') }),
  z.object({ status: z.literal('limited') }),
])
const unavailable = () =>
  new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Private invitations are temporarily unavailable.')
const invalid = () =>
  new ApiError(400, 'VALIDATION_ERROR', 'This code is invalid, expired, or not available for joining.')

export function invitationRepository(env: Environment, token: string) {
  if (!env.EVENT_INVITATION_KEY || !env.EVENT_COVER_OPERATION_KEY) throw unavailable()
  const crypto = invitationCrypto(env.EVENT_INVITATION_KEY)
  const client = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${token}`, 'x-rollcall-cover-key': env.EVENT_COVER_OPERATION_KEY },
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(env.SUPABASE_TIMEOUT_MS) }),
    },
  })
  return {
    async manage(id: string, actor: string, action: 'ensure' | 'rotate' | 'revoke') {
      const event = await createEventRepository(client).get(id, actor)
      if (!event.viewer.isHost) throw new ApiError(404, 'NOT_FOUND', 'Event not found.')
      if (
        event.visibility !== 'private' ||
        event.status !== 'scheduled' ||
        Date.parse(event.startsAt) <= Date.now()
      )
        throw invalid()
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = crypto.generate()
        const result = await client.rpc('manage_event_invitation', {
          p_event_id: id,
          p_hash: crypto.hash(code),
          p_sealed: crypto.seal(code, id),
          p_expires: new Date(Math.min(Date.now() + 7 * 86400000, Date.parse(event.startsAt))).toISOString(),
          p_action: action,
        })
        if (result.error?.code === '23505') continue
        if (result.error) {
          if (result.error.code === 'P0002') throw new ApiError(404, 'NOT_FOUND', 'Event not found.')
          throw unavailable()
        }
        if (result.data === null) return { code: null, expiresAt: null, revokedAt: null }
        const parsed = stored.safeParse(result.data)
        if (!parsed.success || parsed.data.eventId !== id) throw unavailable()
        const value = parsed.data
        try {
          return {
            code:
              !value.revokedAt && Date.parse(value.expiresAt) > Date.now()
                ? (crypto.open(value.sealedCode, id).match(/.{4}/g)?.join('-') ?? null)
                : null,
            expiresAt: value.expiresAt,
            revokedAt: value.revokedAt,
          }
        } catch {
          throw unavailable()
        }
      }
      throw unavailable()
    },
    async redeem(raw: string) {
      const code = normalizeInvitation(raw)
      const result = await client.rpc('redeem_event_invitation', { p_hash: crypto.hash(code) })
      if (result.error) throw unavailable()
      const parsed = outcome.safeParse(result.data)
      if (!parsed.success) throw unavailable()
      if (parsed.data.status === 'limited')
        throw new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Try again in 15 minutes.')
      if (parsed.data.status !== 'joined') throw invalid()
      return { eventId: parsed.data.eventId }
    },
  }
}

export function registerInvitationRoutes(app: FastifyInstance, env: Environment, verify: TokenVerifier) {
  const guard = createAuthGuard(verify)
  const ips = new Map<string, { start: number; count: number }>()
  // Fixed IP windows, independent of code/account. trustProxy remains false.
  function limit(ip: string) {
    const now = Date.now()
    for (const [key, value] of ips) if (value.start < now - 60000) ips.delete(key)
    const value = ips.get(ip) ?? { start: now, count: 0 }
    if (value.count >= 30 || (!ips.has(ip) && ips.size >= 10000))
      throw new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Try again in a minute.')
    value.count++
    ips.set(ip, value)
  }
  app.addHook('onSend', (request, reply, payload, done) => {
    if (
      request.routeOptions.url?.includes('invitation') ||
      request.routeOptions.url === '/api/private-events/join'
    ) {
      reply.header('Cache-Control', 'no-store')
      reply.header('Vary', 'Authorization')
      if (reply.statusCode === 429 && !reply.hasHeader('Retry-After')) reply.header('Retry-After', '900')
    }
    done(null, payload)
  })
  for (const [method, suffix, action] of [
    ['GET', '', 'ensure'],
    ['POST', '/rotate', 'rotate'],
    ['POST', '/revoke', 'revoke'],
  ] as const) {
    app.route({
      method,
      url: `/api/events/:eventId/invitation${suffix}`,
      preHandler: guard,
      handler: async (request) => {
        parseInput(noQuerySchema, request.query)
        if (method === 'POST') parseInput(attendanceBodySchema, request.body)
        const { eventId } = parseInput(eventIdSchema, request.params)
        const actor = request.account
        if (!actor) throw new ApiError(401, 'UNAUTHENTICATED', 'Log in to continue.')
        return invitationRepository(env, request.headers.authorization?.slice(7) ?? '').manage(
          eventId,
          actor.id,
          action,
        )
      },
    })
  }
  app.post('/api/private-events/join', { preHandler: guard }, async (request, reply) => {
    try {
      limit(request.ip)
    } catch (error) {
      reply.header('Retry-After', '60')
      throw error
    }
    parseInput(noQuerySchema, request.query)
    const input = parseInput(z.strictObject({ code: z.string().min(1).max(64) }), request.body)
    return invitationRepository(env, request.headers.authorization?.slice(7) ?? '').redeem(input.code)
  })
}
