import { signUpFixture } from './registration-fixture.js'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import sharp from 'sharp'
import { buildApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createDatabaseClient } from '../../src/db/supabase.js'
import { createEventCoverRepository } from '../../src/modules/events/event-cover-repository.js'
import { validateLocalDatabaseUrl } from '../../scripts/geography/store.js'
import type { HostEventDetails } from '../../src/modules/events/types.js'
import type { CoverMutationResult, CoverUrl } from '../../src/modules/events/event-cover-schema.js'

type Actor = { id: string; token: string }
const enabled = process.env.RUN_LOCAL_INTEGRATION === 'true'

test(
  'local Storage cover validation, visibility, RLS and recoverable lifecycle',
  {
    skip: enabled
      ? false
      : 'Requires local Supabase Storage, operation-key setup and RUN_LOCAL_INTEGRATION=true.',
    timeout: 180000,
  },
  async (t) => {
    const env = loadEnvironment()
    assert.ok(
      ['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.SUPABASE_URL).hostname),
      'Local Supabase only.',
    )
    assert.ok(env.EVENT_COVER_OPERATION_KEY, 'Run the local event cover setup before integration tests.')
    const db = new pg.Client({
      connectionString: validateLocalDatabaseUrl(process.env.GEOGRAPHY_DATABASE_URL),
    })
    await db.connect()
    const emails: string[] = [],
      actors: Actor[] = [],
      eventIds: string[] = []
    const app = buildApp(env, { logger: false })
    const origin = await app.listen({ host: '127.0.0.1', port: 0 })
    t.after(async () => {
      try {
        for (const id of eventIds) {
          const owner = actors[0]
          if (owner) {
            await db.query('delete from public.events where id=$1 and host_id=$2', [id, owner.id])
            await createEventCoverRepository(env, owner.token).cleanup(id)
          }
        }
        // Only synthetic manifest rows; supported Storage removals run above first.
        if (eventIds.length) {
          const remaining = await db.query(
            'select count(*)::int n from storage.objects o join private.event_cover_objects image on image.path=o.name where o.bucket_id=$1 and image.event_id=any($2::uuid[])',
            ['event-covers', eventIds],
          )
          assert.equal(remaining.rows[0]?.n, 0, 'Temporary cover objects must be removed through Storage.')
          await db.query('delete from private.event_cover_objects where event_id=any($1::uuid[])', [eventIds])
        }
        await db.query('delete from auth.users where email=any($1::text[])', [emails])
      } finally {
        await app.close()
        await db.end()
      }
    })
    async function account(): Promise<Actor> {
      const email = `event-cover-${randomUUID()}@example.test`
      emails.push(email)
      const auth = createDatabaseClient(env).auth
      const signup = await signUpFixture(auth, db, {
        email,
        password: `Rc!${randomUUID()}aA7`,
      })
      assert.equal(
        Boolean(signup.error),
        false,
        'Local registration must succeed without exposing credentials.',
      )
      const id = signup.data.user?.id
      assert.ok(id)
      const stored = await db.query<{ confirmation_token: string }>(
        'select confirmation_token from auth.users where id=$1',
        [id],
      )
      const hash = stored.rows[0]?.confirmation_token
      assert.ok(hash)
      const confirmed = await auth.verifyOtp({
        token_hash: hash,
        type: 'signup',
      })
      assert.equal(Boolean(confirmed.error), false)
      const token = confirmed.data.session?.access_token
      assert.ok(token)
      const actor = { id, token }
      actors.push(actor)
      return actor
    }
    const host = await account(),
      member = await account(),
      outsider = await account()
    async function api(method: string, path: string, actor?: Actor, body?: unknown): Promise<Response> {
      const isForm = body instanceof FormData
      return fetch(new URL(path, origin), {
        method,
        headers: {
          ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
          ...(body === undefined || isForm ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      })
    }
    async function json<T>(response: Response, status = 200): Promise<T> {
      assert.equal(
        response.status,
        status,
        'Unexpected local API status; secrets and response URLs are never logged.',
      )
      return (await response.json()) as T
    }
    const games = await json<{ id: number }[]>(await api('GET', '/api/games'))
    const cities = await json<{ id: number }[]>(await api('GET', '/api/cities?country=ME&q=Podgorica'))
    assert.ok(games[0] && cities[0])
    async function event(
      visibility: 'public' | 'unlisted' | 'private' = 'public',
    ): Promise<HostEventDetails> {
      const created = await json<HostEventDetails>(
        await api('POST', '/api/events', host, {
          title: `Synthetic cover ${randomUUID().slice(0, 8)}`,
          description: 'A synthetic event used only for the local persistent cover verification.',
          gameId: games[0]?.id,
          cityId: cities[0]?.id,
          address: 'Synthetic protected cover-test address',
          startsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          endsAt: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
          capacity: 4,
          experienceLevel: 'all-levels',
          visibility,
        }),
        201,
      )
      eventIds.push(created.id)
      return created
    }
    async function bytes(format: 'jpeg' | 'png' | 'webp', color = '#8155bb') {
      return sharp({
        create: { width: 1800, height: 900, channels: 3, background: color },
      })
        .toFormat(format)
        .toBuffer()
    }
    function form(
      buffer: Buffer,
      format: 'jpeg' | 'png' | 'webp' = 'png',
      mime = `image/${format}`,
      filename = `cover.${format}`,
    ) {
      const body = new FormData()
      body.set('file', new Blob([new Uint8Array(buffer)], { type: mime }), filename)
      return body
    }
    async function upload(id: string, format: 'jpeg' | 'png' | 'webp' = 'png') {
      const result = await json<CoverMutationResult>(
        await api('POST', `/api/events/${id}/cover`, host, form(await bytes(format), format)),
      )
      assert.equal(result.cover.kind, 'custom')
      if (result.cover.kind !== 'custom') throw new Error('Expected a persisted cover.')
      assert.equal(result.cleanupPending, false)
      const path = `${id}/${result.cover.version}.webp`
      return { result, path }
    }
    async function coverUrl(id: string, actor?: Actor) {
      return json<CoverUrl | null>(await api('GET', `/api/events/${id}/cover-url`, actor))
    }
    async function retrieve(url: CoverUrl | null) {
      assert.ok(url)
      const response = await fetch(url.imageUrl, {
        signal: AbortSignal.timeout(10000),
      })
      assert.equal(response.status, 200, 'Authorized signed object must be retrievable.')
      const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
      assert.equal(metadata.format, 'webp')
      assert.equal(metadata.width, 1600)
      assert.equal(metadata.height, 800)
      assert.equal(metadata.exif, undefined)
    }
    const publicEvent = await event()
    await t.test(
      'real JPEG/PNG/WebP uploads persist, replace safely and clean previous Storage objects',
      async () => {
        let previous: string | undefined
        for (const format of ['jpeg', 'png', 'webp'] as const) {
          const saved = await upload(publicEvent.id, format)
          if (previous) {
            const retired = await db.query(
              'select count(*)::int n from storage.objects where bucket_id=$1 and name=$2',
              ['event-covers', previous],
            )
            assert.equal(retired.rows[0]?.n, 0)
          }
          previous = saved.path
          const persisted = await json<HostEventDetails>(
            await api('GET', `/api/events/${publicEvent.id}`, host),
          )
          assert.deepEqual(persisted.cover, saved.result.cover)
          await retrieve(await coverUrl(publicEvent.id))
          const discovery = await json<{
            items: { id: string; cover: unknown }[]
          }>(await api('GET', '/api/events'))
          assert.deepEqual(
            discovery.items.find((entry) => entry.id === publicEvent.id)?.cover,
            saved.result.cover,
          )
        }
      },
    )
    await t.test(
      'auth, strict uploads and direct Storage/Data API cannot bypass host or backend validation',
      async () => {
        const source = await bytes('png')
        assert.equal(
          (await api('POST', `/api/events/${publicEvent.id}/cover`, undefined, form(source))).status,
          401,
        )
        assert.equal(
          (await api('POST', `/api/events/${publicEvent.id}/cover`, outsider, form(source))).status,
          404,
        )
        assert.equal((await api('DELETE', `/api/events/${publicEvent.id}/cover`, outsider)).status, 404)
        const forged = form(source)
        forged.set('userId', host.id)
        assert.equal((await api('POST', `/api/events/${publicEvent.id}/cover`, host, forged)).status, 400)
        for (const bad of [
          form(source, 'png', 'image/jpeg', 'cover.jpg'),
          form(source, 'png', 'image/png', 'cover.jpg'),
          form(Buffer.from('broken image')),
          form(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'png', 'image/svg+xml', 'cover.svg'),
        ])
          assert.equal((await api('POST', `/api/events/${publicEvent.id}/cover`, host, bad)).status, 400)
        assert.equal(
          (
            await api(
              'POST',
              `/api/events/${publicEvent.id}/cover`,
              host,
              form(Buffer.alloc(3 * 1024 * 1024 + 1)),
            )
          ).status,
          413,
        )
        const client = createDatabaseClient(env, fetch, host.token)
        assert.ok(
          (
            await client.rpc('reserve_event_cover', {
              p_event_id: publicEvent.id,
            })
          ).error,
          'A user token cannot reserve a path without the backend capability.',
        )
        const guessed = `${publicEvent.id}/${randomUUID()}.webp`
        assert.ok(
          (await client.storage.from('event-covers').upload(guessed, source, { contentType: 'image/webp' }))
            .error,
        )
        assert.ok((await client.storage.from('event-covers').createSignedUploadUrl(guessed)).error)
        const before = await coverUrl(publicEvent.id)
        assert.ok(before)
        const activePath = `${publicEvent.id}/${before.version}.webp`
        assert.ok(
          (await client.storage.from('event-covers').createSignedUrl(activePath, 31536000)).error,
          'Direct Storage signing cannot bypass the backend short lifetime.',
        )
        await client.storage.from('event-covers').remove([activePath])
        await retrieve(await coverUrl(publicEvent.id))
        const separate = await event()
        const checkedClient = createDatabaseClient(
          env,
          (input, init) => {
            const headers = new Headers(init?.headers)
            headers.set('x-rollcall-cover-key', env.EVENT_COVER_OPERATION_KEY ?? '')
            return fetch(input, { ...init, headers })
          },
          host.token,
        )
        assert.ok(
          (
            await checkedClient.rpc('commit_event_cover', {
              p_event_id: separate.id,
              p_path: activePath,
            })
          ).error,
          'Even the backend capability cannot attach another event object.',
        )
        assert.ok(
          (
            await checkedClient.rpc('commit_event_cover', {
              p_event_id: publicEvent.id,
              p_path: '../forged.webp',
            })
          ).error,
        )
        const list = await createDatabaseClient(env).storage.from('event-covers').list(publicEvent.id)
        assert.ok(list.error || list.data?.length === 0, 'Anonymous listing cannot enumerate event covers.')
        assert.equal(
          (await api('POST', `/api/events/${publicEvent.id}/cover?path=other-event`, host, form(source)))
            .status,
          400,
        )
      },
    )
    await t.test(
      'private member access, public/unlisted signing and visibility changes recheck authorization',
      async () => {
        const linked = await event('unlisted')
        await upload(linked.id)
        await retrieve(await coverUrl(linked.id, outsider))
        await retrieve(await coverUrl(linked.id))
        await json(await api('POST', `/api/events/${linked.id}/attendees/me`, member))
        const oldUrl = await coverUrl(linked.id)
        await json(
          await api('PATCH', `/api/events/${linked.id}`, host, {
            visibility: 'private',
          }),
        )
        assert.equal((await api('GET', `/api/events/${linked.id}/cover-url`)).status, 404)
        assert.equal((await api('GET', `/api/events/${linked.id}/cover-url`, outsider)).status, 404)
        await retrieve(await coverUrl(linked.id, host))
        await retrieve(await coverUrl(linked.id, member))
        const current = await coverUrl(linked.id, host)
        assert.ok(current)
        const objectPath = `${linked.id}/${current.version}.webp`
        assert.ok(
          (
            await createDatabaseClient(env, fetch, outsider.token)
              .storage.from('event-covers')
              .download(objectPath)
          ).error,
        )
        assert.ok(
          (await createDatabaseClient(env).storage.from('event-covers').createSignedUrl(objectPath, 60))
            .error,
        )
        // Previously issued bearer URLs remain usable only until their documented expiry.
        await retrieve(oldUrl)
        await json(await api('DELETE', `/api/events/${linked.id}/attendees/me`, member))
        assert.equal((await api('GET', `/api/events/${linked.id}/cover-url`, member)).status, 404)
        assert.ok(
          (
            await createDatabaseClient(env, fetch, member.token)
              .storage.from('event-covers')
              .download(objectPath)
          ).error,
        )
        const hidden = await event('private')
        await upload(hidden.id)
        assert.equal((await api('GET', `/api/events/${hidden.id}/cover-url`, outsider)).status, 404)
      },
    )
    await t.test(
      'lost commit acknowledgements and failed Storage cleanup retain recoverable consistent state',
      async () => {
        const interrupted = await event()
        const original = await upload(interrupted.id)
        const source = {
          buffer: await bytes('webp'),
          filename: 'cover.webp',
          mimeType: 'image/webp',
        }
        const lostCommit: typeof fetch = async (input, init) => {
          const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
          const result = await fetch(input, init)
          if (url.pathname.endsWith('/rpc/commit_event_cover') && result.ok)
            throw new Error('Synthetic lost commit acknowledgement')
          return result
        }
        await assert.rejects(
          createEventCoverRepository(env, host.token, lostCommit).upload(interrupted.id, host.id, source),
        )
        const afterLost = await coverUrl(interrupted.id, host)
        assert.ok(afterLost)
        assert.notEqual(
          afterLost.version,
          original.result.cover.kind === 'custom' ? original.result.cover.version : '',
        )
        await retrieve(afterLost)
        const failedRemoval: typeof fetch = async (input, init) => {
          const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
          if (url.pathname.endsWith('/storage/v1/object/event-covers') && init?.method === 'DELETE')
            return Response.json({ message: 'Synthetic cleanup interruption' }, { status: 503 })
          return fetch(input, init)
        }
        const replacement = await createEventCoverRepository(env, host.token, failedRemoval).upload(
          interrupted.id,
          host.id,
          source,
        )
        assert.equal(replacement.cleanupPending, true)
        await retrieve(await coverUrl(interrupted.id, host))
        const oldPath = `${interrupted.id}/${afterLost.version}.webp`
        assert.equal(
          (
            await db.query('select count(*)::int n from storage.objects where bucket_id=$1 and name=$2', [
              'event-covers',
              oldPath,
            ])
          ).rows[0]?.n,
          1,
        )
        assert.equal(await createEventCoverRepository(env, host.token).cleanup(interrupted.id), false)
        assert.equal(
          (
            await db.query('select count(*)::int n from storage.objects where bucket_id=$1 and name=$2', [
              'event-covers',
              oldPath,
            ])
          ).rows[0]?.n,
          0,
        )
      },
    )
    await t.test(
      'failed replacement preserves current object; removal/default and event deletion clean actual files',
      async () => {
        const before = await coverUrl(publicEvent.id, host)
        assert.ok(before)
        const failing: typeof fetch = async (input, init) => {
          const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
          if (url.pathname.includes('/storage/v1/object/event-covers/'))
            throw new Error('Synthetic interrupted upload')
          return fetch(input, init)
        }
        const source = {
          buffer: await bytes('png'),
          filename: 'cover.png',
          mimeType: 'image/png',
        }
        await assert.rejects(
          createEventCoverRepository(env, host.token, failing).upload(publicEvent.id, host.id, source),
        )
        assert.equal((await coverUrl(publicEvent.id, host))?.version, before.version)
        await retrieve(await coverUrl(publicEvent.id))
        const removed = await json<CoverMutationResult>(
          await api('DELETE', `/api/events/${publicEvent.id}/cover`, host),
        )
        assert.equal(removed.cover.kind, 'default')
        assert.equal(removed.cleanupPending, false)
        assert.equal(await coverUrl(publicEvent.id), null)
        const saved = await upload(publicEvent.id)
        assert.equal((await api('DELETE', `/api/events/${publicEvent.id}`, host)).status, 204)
        const remaining = await db.query(
          'select count(*)::int n from storage.objects where bucket_id=$1 and name=$2',
          ['event-covers', saved.path],
        )
        assert.equal(remaining.rows[0]?.n, 0)
        assert.equal((await api('GET', `/api/events/${publicEvent.id}/cover-url`, host)).status, 404)
        const retried = await json<{ cleanupPending: boolean }>(
          await api('POST', `/api/events/${publicEvent.id}/cover/cleanup`, host),
        )
        assert.equal(retried.cleanupPending, false)
      },
    )
  },
)
