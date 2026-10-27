import { signUpFixture } from './registration-fixture.js'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import pg from 'pg'
import { buildApp } from '../../src/app.js'
import { loadEnvironment } from '../../src/config/env.js'
import { createDatabaseClient } from '../../src/db/supabase.js'
import { validateLocalDatabaseUrl } from '../../scripts/geography/store.js'

test(
  'local Auth registration, confirmation, credentials, session restoration, recovery and logout',
  {
    skip:
      process.env.RUN_LOCAL_INTEGRATION === 'true'
        ? false
        : 'Set RUN_LOCAL_INTEGRATION=true and configure the existing local Supabase stack.',
    timeout: 90000,
  },
  async (t) => {
    const env = loadEnvironment()
    assert.ok(
      ['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.SUPABASE_URL).hostname),
      'Auth integration tests only target loopback Supabase.',
    )
    const db = new pg.Client({
      connectionString: validateLocalDatabaseUrl(process.env.GEOGRAPHY_DATABASE_URL),
      connectionTimeoutMillis: 5000,
    })
    await db.connect()
    const email = `auth-integration-${randomUUID()}@example.test`
    t.after(async () => {
      // Remove only this test's account; profiles and Auth sessions cascade. Never reset data.
      await db.query('delete from auth.users where email = $1', [email])
      await db.end()
    })
    const app = buildApp(env, { logger: false })
    t.after(() => app.close())
    const auth = createDatabaseClient(env).auth
    const password = `Rc!${randomUUID()}aA7`
    const replacement = `Rc!${randomUUID()}aA8`

    assert.equal((await app.inject('/api/me')).statusCode, 401)
    const settingsResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(5000),
    })
    assert.equal(settingsResponse.status, 200)
    const settings = (await settingsResponse.json()) as { mailer_autoconfirm?: boolean }
    assert.equal(settings.mailer_autoconfirm, false, 'Local auth.email.enable_confirmations must be true.')

    const registration = await signUpFixture(auth, db, { email, password })
    assert.equal(registration.error, null, 'Local registration should succeed with SMTP configured.')
    assert.equal(registration.data.session, null, 'Unconfirmed registration must not create a session.')
    const accountId = registration.data.user?.id
    assert.ok(accountId)
    const profile = await db.query<{ id: string; display_name: string }>(
      'select id, display_name from public.profiles where id = $1',
      [accountId],
    )
    assert.equal(profile.rowCount, 1)
    assert.equal(profile.rows[0]?.display_name, 'RollCall player')
    assert.ok((await auth.signInWithPassword({ email, password })).error, 'Unconfirmed login must fail.')

    // Exercise the genuine Auth confirmation endpoint with its stored one-way hash.
    // The database connection is local test maintenance only; it is never an API credential.
    const confirmation = await db.query<{ confirmation_token: string }>(
      'select confirmation_token from auth.users where id = $1',
      [accountId],
    )
    const confirmationHash = confirmation.rows[0]?.confirmation_token
    assert.ok(confirmationHash)
    const confirmed = await auth.verifyOtp({ token_hash: confirmationHash, type: 'signup' })
    assert.equal(confirmed.error, null)
    assert.ok(confirmed.data.session)
    assert.equal(confirmed.data.user?.id, accountId)
    const invalid = await auth.signInWithPassword({ email, password: `wrong-${randomUUID()}` })
    assert.ok(invalid.error)

    const login = await auth.signInWithPassword({ email, password })
    assert.equal(login.error, null)
    assert.ok(login.data.session)
    const session = login.data.session
    const identity = await app.inject({
      url: '/api/me?userId=1',
      headers: { authorization: `Bearer ${session.access_token}` },
    })
    assert.equal(identity.statusCode, 200)
    assert.deepEqual(identity.json(), { id: accountId, email })
    assert.equal(identity.headers['cache-control'], 'no-store')

    const restored = createDatabaseClient(env).auth
    const restore = await restored.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
    assert.equal(restore.error, null)
    assert.equal(restore.data.user?.id, accountId)
    const refreshed = await restored.refreshSession()
    assert.equal(refreshed.error, null, 'The supported SDK should refresh a genuine session.')
    assert.equal(refreshed.data.user?.id, accountId)
    const refreshedSession = refreshed.data.session
    assert.ok(refreshedSession)

    const duplicateClient = createDatabaseClient(env).auth
    const duplicate = await signUpFixture(duplicateClient, db, { email, password })
    assert.equal(duplicate.data.session, null)
    assert.ok(
      duplicate.error || duplicate.data.user?.identities?.length === 0,
      'Confirmed duplicate signup must fail or return Supabase anti-enumeration output.',
    )
    const accounts = await db.query<{ count: number }>(
      'select count(*)::int as count from auth.users where email = $1',
      [email],
    )
    assert.equal(accounts.rows[0]?.count, 1)

    assert.equal((await restored.resetPasswordForEmail(email)).error, null)
    const recovery = await db.query<{ recovery_token: string }>(
      'select recovery_token from auth.users where id = $1',
      [accountId],
    )
    const recoveryHash = recovery.rows[0]?.recovery_token
    assert.ok(recoveryHash)
    const recovered = await restored.verifyOtp({ token_hash: recoveryHash, type: 'recovery' })
    assert.equal(recovered.error, null)
    assert.ok(recovered.data.session)
    assert.equal((await restored.updateUser({ password: replacement })).error, null)
    assert.ok((await auth.signInWithPassword({ email, password })).error, 'Old password must stop working.')
    const newLogin = await restored.signInWithPassword({ email, password: replacement })
    assert.equal(newLogin.error, null)
    assert.ok(newLogin.data.session)
    const logoutRefreshToken = newLogin.data.session.refresh_token
    assert.equal((await restored.signOut()).error, null)
    assert.equal((await restored.getSession()).data.session, null)
    assert.equal((await app.inject('/api/me')).statusCode, 401)
    assert.ok(
      (await createDatabaseClient(env).auth.refreshSession({ refresh_token: logoutRefreshToken })).error,
      'Logout must revoke session refresh credentials.',
    )
    assert.equal(
      (await app.inject({ url: '/api/me', headers: { authorization: 'Bearer e30.e30.aW52YWxpZA' } }))
        .statusCode,
      401,
    )
    assert.equal((await app.inject('/api/countries')).statusCode, 200)
    assert.equal((await app.inject('/api/cities?country=ME&q=Podgorica')).statusCode, 200)
  },
)
