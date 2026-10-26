import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { buildApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createDatabaseClient } from '../../src/db/supabase.js'
import { bootstrapSuperadmin } from '../../scripts/bootstrap-superadmin.js'

test(
  'local administrative authorization, immutable auditing, bootstrap and concurrent role changes',
  {
    skip: process.env.RUN_LOCAL_INTEGRATION !== 'true',
    timeout: 120000,
  },
  async (t) => {
    const env = loadEnvironment(),
      url = process.env.GEOGRAPHY_DATABASE_URL ?? ''
    assert.ok(
      [url, env.SUPABASE_URL].every((value) =>
        ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname),
      ),
    )
    const db = new pg.Client({ connectionString: url })
    await db.connect()
    const app = buildApp(env, { logger: false })
    await app.ready()
    const ids: string[] = [],
      emails: string[] = []
    t.after(async () => {
      await app.close()
      // Trusted fixture cleanup only: API clients can neither disable triggers nor delete audits.
      await db.query('begin')
      try {
        await db.query("set local session_replication_role='replica'")
        await db.query('delete from private.role_audit where target_id=any($1::uuid[])', [ids])
        await db.query('commit')
      } catch (error) {
        await db.query('rollback')
        throw error
      }
      await db.query('delete from public.events where host_id=any($1::uuid[])', [ids])
      await db.query('delete from auth.users where email=any($1::text[])', [emails])
      await db.end()
    })
    assert.equal(
      (await db.query("select count(*)::int as n from private.account_roles where role='superadmin'")).rows[0]
        .n,
      0,
      'Use an isolated local database with no configured superadmin; no existing role is changed.',
    )
    async function account(confirmed = true) {
      const email = `admin-test-${randomUUID()}@example.test`
      emails.push(email)
      const auth = createDatabaseClient(env).auth,
        result = await auth.signUp({
          email,
          password: `Rc!${randomUUID()}aA7`,
        })
      const id = result.data.user?.id
      assert.ok(id)
      ids.push(id)
      if (!confirmed) return { id, token: '' }
      const hash = (await db.query('select confirmation_token from auth.users where id=$1', [id])).rows[0]
        .confirmation_token
      const session = await auth.verifyOtp({
          token_hash: hash,
          type: 'signup',
        }),
        token = session.data.session?.access_token
      assert.ok(token)
      return { id, token }
    }
    const root = await account(),
      admin = await account(),
      user = await account(),
      other = await account(),
      unconfirmed = await account(false)
    async function call(method: 'GET' | 'PATCH', path: string, actor = user, body?: unknown) {
      return app.inject({
        method,
        url: path,
        headers: { authorization: `Bearer ${actor.token}` },
        ...(body ? { payload: body } : {}),
      })
    }
    await t.test(
      'bootstrap validates confirmation, is audited, refuses repeat and is not HTTP-accessible',
      async () => {
        await assert.rejects(
          bootstrapSuperadmin([`--user-id=${unconfirmed.id}`, '--confirm=INITIALIZE_LOCAL_SUPERADMIN'], url),
        )
        await bootstrapSuperadmin([`--user-id=${root.id}`, '--confirm=INITIALIZE_LOCAL_SUPERADMIN'], url)
        await assert.rejects(
          bootstrapSuperadmin([`--user-id=${other.id}`, '--confirm=INITIALIZE_LOCAL_SUPERADMIN'], url),
        )
        const audit = await db.query(
          "select * from private.role_audit where action='bootstrap' and target_id=$1",
          [root.id],
        )
        assert.equal(audit.rowCount, 1)
        assert.equal(audit.rows[0].actor_id, null)
        assert.equal(audit.rows[0].source, 'local_operator')
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: '/api/admin/bootstrap',
              payload: { userId: user.id },
            })
          ).statusCode,
          404,
        )
      },
    )
    await t.test(
      'missing assignment defaults to user; metadata, anonymous calls and direct RPCs cannot grant roles',
      async () => {
        const ordinary = await call('GET', '/api/me/permissions')
        assert.equal(ordinary.statusCode, 200)
        assert.deepEqual(ordinary.json(), {
          role: 'user',
          capabilities: { accessAdmin: false, manageAdminRoles: false },
        })
        assert.equal(ordinary.headers['cache-control'], 'no-store')
        assert.equal((await app.inject({ method: 'GET', url: '/api/me/permissions' })).statusCode, 401)
        assert.equal((await call('GET', '/api/admin/users')).statusCode, 403)
        assert.equal(
          (
            await call('PATCH', `/api/admin/users/${other.id}/role`, user, {
              role: 'admin',
            })
          ).statusCode,
          403,
        )
        const direct = createDatabaseClient(env, fetch, user.token)
        await direct.auth.updateUser({
          data: { role: 'superadmin', app_role: 'superadmin' },
        })
        assert.equal((await call('GET', '/api/me/permissions')).json().role, 'user')
        assert.ok(
          (
            await direct.rpc('change_admin_role', {
              p_target: user.id,
              p_role: 'admin',
            })
          ).error,
        )
        assert.ok((await direct.rpc('admin_users', { p_limit: 20 })).error)
        assert.ok((await direct.rpc('admin_role_audit', { p_limit: 20 })).error)
        const headers = {
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        }
        for (const table of ['account_roles', 'role_audit']) {
          const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
            headers: { ...headers, 'Accept-Profile': 'private' },
          })
          assert.ok(response.status >= 400)
        }
        const deniedBootstrap = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/bootstrap_superadmin`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ p_target: user.id }),
        })
        assert.ok(deniedBootstrap.status >= 400)
        assert.ok((await call('PATCH', '/api/me/profile', user, { role: 'superadmin' })).statusCode >= 400)
      },
    )
    await t.test(
      'superadmin-only transitions, current-token demotion and idempotent atomic audits',
      async () => {
        const promote = await call('PATCH', `/api/admin/users/${admin.id}/role`, root, { role: 'admin' })
        assert.equal(promote.statusCode, 200)
        assert.equal(promote.json().changed, true)
        assert.deepEqual((await call('GET', '/api/me/permissions', admin)).json(), {
          role: 'admin',
          capabilities: { accessAdmin: true, manageAdminRoles: false },
        })
        for (const path of ['/api/admin/users', '/api/admin/role-audit'])
          assert.equal((await call('GET', path, admin)).statusCode, 403)
        assert.equal(
          (
            await call('PATCH', `/api/admin/users/${user.id}/role`, admin, {
              role: 'admin',
            })
          ).statusCode,
          403,
        )
        assert.equal(
          (
            await call('PATCH', `/api/admin/users/${other.id}/role`, admin, {
              role: 'user',
            })
          ).statusCode,
          403,
        )
        const again = await call('PATCH', `/api/admin/users/${admin.id}/role`, root, { role: 'admin' })
        assert.equal(again.json().changed, false)
        assert.equal(
          (await db.query('select count(*)::int as n from private.role_audit where target_id=$1', [admin.id]))
            .rows[0].n,
          1,
        )
        for (const target of [root.id])
          assert.equal(
            (
              await call('PATCH', `/api/admin/users/${target}/role`, root, {
                role: 'user',
              })
            ).statusCode,
            400,
          )
        await db.query("insert into private.account_roles(profile_id,role) values($1,'superadmin')", [
          user.id,
        ])
        assert.equal(
          (
            await call('PATCH', `/api/admin/users/${user.id}/role`, root, {
              role: 'user',
            })
          ).statusCode,
          400,
        )
        await db.query('delete from private.account_roles where profile_id=$1', [user.id])
        for (const role of ['superadmin', 'owner', 'ADMIN'])
          assert.equal(
            (
              await call('PATCH', `/api/admin/users/${user.id}/role`, root, {
                role,
              })
            ).statusCode,
            400,
          )
        assert.equal(
          (
            await call('PATCH', `/api/admin/users/${randomUUID()}/role`, root, {
              role: 'admin',
            })
          ).statusCode,
          404,
        )
        assert.equal(
          (
            await call('PATCH', '/api/admin/users/invalid/role', root, {
              role: 'admin',
            })
          ).statusCode,
          400,
        )
        assert.equal(
          (
            await call('PATCH', `/api/admin/users/${admin.id}/role`, root, {
              role: 'user',
            })
          ).statusCode,
          200,
        )
        assert.equal((await call('GET', '/api/me/permissions', admin)).json().role, 'user')
        assert.equal((await call('GET', '/api/admin/users', admin)).statusCode, 403)
        const events = await call('GET', `/api/admin/role-audit?targetId=${admin.id}`, root)
        assert.equal(events.statusCode, 200)
        assert.equal(events.json().items.length, 2)
        assert.ok(
          events
            .json()
            .items.every(
              (entry: { actorId: string; targetId: string }) =>
                entry.actorId === root.id && entry.targetId === admin.id,
            ),
        )
        assert.equal((await call('GET', '/api/admin/users?limit=51', root)).statusCode, 400)
        assert.equal((await call('GET', `/api/admin/users?userId=${user.id}`, root)).json().items.length, 1)
        const first = (await call('GET', '/api/admin/users?limit=1', root)).json()
        assert.equal(first.items.length, 1)
        assert.ok(first.nextCursor)
        const next = (await call('GET', `/api/admin/users?limit=1&after=${first.nextCursor}`, root)).json()
        assert.notEqual(first.items[0].id, next.items[0].id)
      },
    )
    await t.test('simultaneous conflicting transitions produce a consistent audit chain', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          call('PATCH', `/api/admin/users/${other.id}/role`, root, {
            role: i % 2 ? 'user' : 'admin',
          }),
        ),
      )
      assert.ok(results.every((response) => response.statusCode === 200))
      const rows = (
        await db.query(
          'select previous_role,new_role from private.role_audit where target_id=$1 order by id',
          [other.id],
        )
      ).rows
      let previous = 'user'
      for (const row of rows) {
        assert.equal(row.previous_role, previous)
        assert.notEqual(row.previous_role, row.new_role)
        previous = row.new_role
      }
      assert.equal((await call('GET', '/api/me/permissions', other)).json().role, previous)
    })
    await t.test('admin roles grant no private profile, event, invitation or cover override', async () => {
      await call('PATCH', `/api/admin/users/${admin.id}/role`, root, {
        role: 'admin',
      })
      assert.equal((await call('PATCH', '/api/me/profile', user, { birthYear: 1999 })).statusCode, 200)
      const publicProfile = (await call('GET', `/api/users/${user.id}`, root)).json()
      assert.equal('birthYear' in publicProfile, false)
      assert.equal('email' in publicProfile, false)
      assert.equal('role' in publicProfile, false)
      const game = (await db.query('select id from public.games order by id limit 1')).rows[0].id
      const city = (await db.query('select id from public.cities order by id limit 1')).rows[0].id
      const created = await app.inject({
        method: 'POST',
        url: '/api/events',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          title: 'Administrative boundary fixture',
          description: 'Synthetic private fixture for role boundary checks.',
          gameId: game,
          cityId: city,
          address: 'Private test address',
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 90000000).toISOString(),
          capacity: 1,
          experienceLevel: 'all-levels',
          visibility: 'private',
        },
      })
      assert.equal(created.statusCode, 201)
      const eventId = created.json().id
      for (const actor of [root, admin]) {
        for (const suffix of ['', '/cover-url', '/invitation'])
          assert.equal((await call('GET', `/api/events/${eventId}${suffix}`, actor)).statusCode, 404)
        assert.equal(
          (
            await call('PATCH', `/api/events/${eventId}`, actor, {
              title: 'Unauthorized edit',
            })
          ).statusCode,
          404,
        )
        assert.equal(
          (
            await app.inject({
              method: 'POST',
              url: `/api/events/${eventId}/attendees/me`,
              headers: { authorization: `Bearer ${actor.token}` },
            })
          ).statusCode,
          404,
        )
      }
      const list = (await call('GET', '/api/admin/users', root)).json()
      for (const item of list.items)
        assert.deepEqual(Object.keys(item).sort(), ['createdAt', 'displayName', 'id', 'role'])
    })
    await t.test('audit and role tables have no client write path or executor membership', async () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const check = await db.query(
          "select has_table_privilege($1,'private.role_audit','UPDATE,DELETE,TRUNCATE') as writes,pg_has_role($1,'rollcall_admin_executor','MEMBER') as member,has_function_privilege($1,'private.bootstrap_superadmin(uuid)','EXECUTE') as bootstrap",
          [role],
        )
        assert.equal(check.rows[0].writes, false)
        assert.equal(check.rows[0].member, false)
        assert.equal(check.rows[0].bootstrap, false)
      }
      await assert.rejects(db.query('update private.role_audit set source=source'))
      await assert.rejects(db.query('delete from private.role_audit'))
      const direct = createDatabaseClient(env, fetch, root.token)
      assert.ok(
        (
          await direct.rpc('change_admin_role', {
            p_target: root.id,
            p_role: 'user',
          })
        ).error,
      )
      assert.ok(
        (
          await direct.rpc('change_admin_role', {
            p_target: user.id,
            p_role: 'superadmin',
          })
        ).error,
      )
      const page = (await call('GET', '/api/admin/role-audit?limit=1', root)).json()
      assert.equal(page.items.length, 1)
      assert.ok(page.nextCursor)
      assert.equal(
        (await call('GET', `/api/admin/role-audit?limit=1&before=${page.nextCursor}`, root)).json().items
          .length,
        1,
      )
    })
    await t.test(
      'audit failure rolls back the role, deleted accounts fail closed and bootstrap cannot silently restart',
      async () => {
        // A fixture-only database constraint forces the audit INSERT to fail after the role write.
        assert.match(user.id, /^[0-9a-f-]{36}$/)
        await db.query(
          `alter table private.role_audit add constraint admin_fixture_audit_failure check(target_id<>'${user.id}'::uuid) not valid`,
        )
        try {
          assert.equal(
            (
              await call('PATCH', `/api/admin/users/${user.id}/role`, root, {
                role: 'admin',
              })
            ).statusCode,
            503,
          )
          assert.equal((await call('GET', '/api/me/permissions', user)).json().role, 'user')
          assert.equal(
            (
              await db.query('select count(*)::int as n from private.role_audit where target_id=$1', [
                user.id,
              ])
            ).rows[0].n,
            0,
          )
        } finally {
          await db.query('alter table private.role_audit drop constraint admin_fixture_audit_failure')
        }
        const removed = await account()
        await db.query('delete from auth.users where id=$1', [removed.id])
        assert.equal((await call('GET', '/api/me/permissions', removed)).statusCode, 403)
        await db.query('delete from private.account_roles where profile_id=$1', [root.id])
        await assert.rejects(
          bootstrapSuperadmin([`--user-id=${other.id}`, '--confirm=INITIALIZE_LOCAL_SUPERADMIN'], url),
        )
      },
    )
  },
)
