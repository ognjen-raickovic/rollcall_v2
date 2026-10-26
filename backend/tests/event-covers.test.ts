import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import sharp from 'sharp'
import { installErrorHandler } from '../src/middleware/error-handler.js'
import { ApiError } from '../src/shared/api-error.js'
import { registerEventCoverRoutes } from '../src/modules/events/event-cover-routes.js'
import { prepareEventCover, MAX_COVER_BYTES } from '../src/modules/events/event-cover-image.js'
import { createEventCoverRepository } from '../src/modules/events/event-cover-repository.js'
import type { EventCoverRepository } from '../src/modules/events/event-cover-repository.js'
import type { CoverSource } from '../src/modules/events/event-cover-image.js'
import { testEnvironment } from './helpers.js'

const eventId = randomUUID()
const actorId = randomUUID()
const version = randomUUID()
const path = `${eventId}/${version}.webp`
const token = 'e30.e30.verified'
const key = 'test-only-operation-key-not-a-real-secret-0000000'
const custom = {
  kind: 'custom' as const,
  version,
  imageUrl: '/images/role-playing.svg' as const,
}

async function image(format: 'jpeg' | 'png' | 'webp', width = 64, height = 32): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: '#653399' },
  })
    .toFormat(format)
    .toBuffer()
}

function multipartBody(content: Buffer, filename = 'cover.png', mime = 'image/png', extra = '') {
  const boundary = `cover-test-${randomUUID()}`
  return {
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
      ),
      content,
      Buffer.from(
        `\r\n${extra ? `--${boundary}\r\nContent-Disposition: form-data; name="userId"\r\n\r\n${extra}\r\n` : ''}--${boundary}--\r\n`,
      ),
    ]),
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${token}`,
    },
  }
}

test('cover normalization accepts supported decoded images and strips metadata with bounded dimensions', async () => {
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const encoded = await prepareEventCover({
      buffer: await image(format, 2000, 1000),
      filename: `safe.${format}`,
      mimeType: `image/${format}`,
    })
    const metadata = await sharp(encoded).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width, 1600)
    assert.equal(metadata.height, 800)
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.icc, undefined)
    assert.ok(encoded.length <= MAX_COVER_BYTES)
  }
  const privateMetadata = await sharp(await image('jpeg'))
    .withExif({ IFD0: { Artist: 'Synthetic private metadata' } })
    .jpeg()
    .toBuffer()
  assert.ok((await sharp(privateMetadata).metadata()).exif)
  const stripped = await prepareEventCover({
    buffer: privateMetadata,
    filename: 'cover.jpg',
    mimeType: 'image/jpeg',
  })
  assert.equal((await sharp(stripped).metadata()).exif, undefined)
})

test('cover validation rejects oversize, corrupt, unsafe, mismatched and excessive-dimension sources', async () => {
  const valid = await image('png')
  const sources: CoverSource[] = [
    {
      buffer: Buffer.alloc(MAX_COVER_BYTES + 1),
      filename: 'cover.png',
      mimeType: 'image/png',
    },
    {
      buffer: Buffer.from('not an image'),
      filename: 'cover.png',
      mimeType: 'image/png',
    },
    {
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      filename: 'cover.svg',
      mimeType: 'image/svg+xml',
    },
    {
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      filename: 'cover.png',
      mimeType: 'image/png',
    },
    {
      buffer: Buffer.concat([valid.subarray(0, 8), Buffer.from('broken')]),
      filename: 'cover.png',
      mimeType: 'image/png',
    },
    { buffer: valid, filename: 'cover.jpg', mimeType: 'image/png' },
    { buffer: valid, filename: 'cover.jpg', mimeType: 'image/jpeg' },
    { buffer: valid, filename: 'cover.txt', mimeType: 'image/png' },
    { buffer: Buffer.alloc(0), filename: 'cover.png', mimeType: 'image/png' },
    {
      buffer: await image('png', 9000, 1),
      filename: 'cover.png',
      mimeType: 'image/png',
    },
    {
      buffer: await image('png', 5000, 4000),
      filename: 'cover.png',
      mimeType: 'image/png',
    },
  ]
  for (const source of sources) {
    await assert.rejects(prepareEventCover(source), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.ok([400, 413].includes(error.status))
      assert.ok(error.fields.image)
      assert.equal(error.message.includes(source.filename), false)
      return true
    })
  }
})

test('cover routes derive actors from verified tokens and reject malformed paths, fields and auth', async (t) => {
  const calls: { operation: string; actor?: string; token?: string }[] = []
  const app = Fastify()
  app.decorate('assertActiveAccount',async()=>{})
  installErrorHandler(app)
  app.register(multipart, {
    limits: { files: 1, fields: 0, fileSize: MAX_COVER_BYTES },
  })
  const repository: EventCoverRepository = {
    upload: async (_id, actor, source) => {
      calls.push({ operation: 'upload', actor })
      assert.equal(source.filename, 'cover.png')
      return { eventId, cover: custom, cleanupPending: false }
    },
    remove: async (_id, actor) => {
      calls.push({ operation: 'remove', actor })
      return {
        eventId,
        cover: { kind: 'default', imageUrl: '/images/role-playing.svg' },
        cleanupPending: false,
      }
    },
    getUrl: async () => null,
    cleanup: async () => false,
  }
  registerEventCoverRoutes(app, {
    verify: async (value) => {
      if (value !== token) throw new Error('Invalid test token')
      return { id: actorId, email: null }
    },
    repository: (accessToken) => {
      calls.push({ operation: 'repository', token: accessToken })
      return repository
    },
  })
  t.after(() => app.close())
  const source = multipartBody(await image('png'))
  const saved = await app.inject({
    method: 'POST',
    url: `/api/events/${eventId}/cover`,
    ...source,
  })
  assert.equal(saved.statusCode, 200)
  assert.equal(saved.headers['cache-control'], 'no-store')
  assert.deepEqual(saved.json(), {
    eventId,
    cover: custom,
    cleanupPending: false,
  })
  assert.ok(calls.some((entry) => entry.actor === actorId))
  const before = calls.length
  for (const url of [`/api/events/not-a-uuid/cover`, `/api/events/${eventId}/cover?path=another-event`]) {
    assert.equal((await app.inject({ method: 'POST', url, ...source })).statusCode, 400)
  }
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: `/api/events/${eventId}/cover`,
        ...multipartBody(await image('png'), 'cover.png', 'image/png', randomUUID()),
      })
    ).statusCode,
    400,
  )
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: `/api/events/${eventId}/cover`,
        payload: source.payload,
        headers: { 'content-type': source.headers['content-type'] },
      })
    ).statusCode,
    401,
  )
  assert.equal(calls.length, before)
  const defaultCover = await app.inject({
    url: `/api/events/${eventId}/cover-url`,
  })
  assert.equal(defaultCover.statusCode, 200)
  assert.equal(defaultCover.json(), null)
  assert.equal(defaultCover.headers.vary, 'Authorization')
  assert.equal(
    (
      await app.inject({
        url: `/api/events/${eventId}/cover-url`,
        headers: { authorization: 'Bearer malformed' },
      })
    ).statusCode,
    401,
  )
  const removed = await app.inject({
    method: 'DELETE',
    url: `/api/events/${eventId}/cover`,
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(removed.statusCode, 200)
  assert.ok(calls.some((entry) => entry.operation === 'remove' && entry.actor === actorId))
})

test('cover repository normalizes writes, validates scoped paths and compensates without deleting active replacements', async () => {
  const calls: string[] = []
  let committed = false
  let lostAcknowledgement = false
  let cleanupRequested = false
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    const operation = url.pathname.split('/').at(-1) ?? ''
    calls.push(operation)
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('authorization'), `Bearer ${token}`)
    const body =
      init?.body && typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, string>) : {}
    if (url.pathname.includes('/rest/v1/rpc/')) {
      if (operation !== 'get_event' && operation !== 'get_event_cover')
        assert.equal(headers.get('x-rollcall-cover-key'), key)
      if (operation === 'get_event')
        return Response.json({
          id: eventId,
          host: { id: actorId },
          viewer: { userId: actorId, isHost: true },
        })
      if (operation === 'reserve_event_cover') return Response.json({ eventId, path, version })
      if (operation === 'commit_event_cover') {
        assert.equal(body.p_path, path)
        committed = true
        if (lostAcknowledgement) throw new Error('Simulated lost acknowledgement')
        return Response.json({ eventId, cover: custom })
      }
      if (operation === 'abort_event_cover') {
        cleanupRequested = !committed
        return Response.json(null)
      }
      if (operation === 'pending_event_cover_cleanup')
        return Response.json(cleanupRequested ? [{ eventId, path, version }] : [])
      if (operation === 'complete_event_cover_cleanup') return Response.json(null)
    }
    if (url.pathname.endsWith(`/object/event-covers/${path}`)) {
      assert.equal(headers.get('x-rollcall-cover-key'), key)
      assert.equal(headers.get('content-type'), 'image/webp')
      return Response.json({ Key: `event-covers/${path}`, Id: version })
    }
    throw new Error('Unexpected test operation')
  }
  const repository = createEventCoverRepository(
    testEnvironment({ EVENT_COVER_OPERATION_KEY: key }),
    token,
    fetcher,
  )
  const source = {
    buffer: await image('png'),
    filename: 'cover.png',
    mimeType: 'image/png',
  }
  assert.deepEqual(await repository.upload(eventId, actorId, source), {
    eventId,
    cover: custom,
    cleanupPending: false,
  })
  lostAcknowledgement = true
  await assert.rejects(repository.upload(eventId, actorId, source), ApiError)
  assert.equal(
    cleanupRequested,
    false,
    'An acknowledged-in-database image must never enter compensating deletion.',
  )
  assert.ok(calls.includes('abort_event_cover'))
  assert.equal(calls.includes('complete_event_cover_cleanup'), false)
})

test('cover reader signs only the authorized current event path and bounds URL lifetime', async () => {
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    if (url.pathname.endsWith('/rpc/get_event_cover')) {
      assert.equal(new Headers(init?.headers).get('x-rollcall-cover-key'), null)
      return Response.json({ eventId, version, path, visibility: 'public' })
    }
    if (url.pathname.endsWith(`/object/sign/event-covers/${path}`)) {
      assert.equal(
        new Headers(init?.headers).get('x-rollcall-cover-key'),
        key,
        'Only backend-limited signing is authorized.',
      )
      assert.equal(JSON.parse(String(init?.body)).expiresIn, 60)
      return Response.json({
        signedURL: `/object/sign/event-covers/${path}?token=synthetic-test-only`,
      })
    }
    throw new Error('Unexpected test operation')
  }
  const result = await createEventCoverRepository(
    testEnvironment({ EVENT_COVER_OPERATION_KEY: key }),
    undefined,
    fetcher,
  ).getUrl(eventId)
  assert.ok(result)
  assert.equal(result.eventId, eventId)
  assert.ok(Date.parse(result.expiresAt) <= Date.now() + 60000)
  assert.equal(new URL(result.imageUrl).origin, 'http://127.0.0.1:55321')
  const bad: typeof fetch = async () =>
    Response.json({
      eventId,
      version,
      path: `${randomUUID()}/${version}.webp`,
      visibility: 'public',
    })
  await assert.rejects(
    createEventCoverRepository(testEnvironment(), undefined, bad).getUrl(eventId),
    ApiError,
  )
})
