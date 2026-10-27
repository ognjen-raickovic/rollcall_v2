import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../src/app.js";
import { loadEnvironment } from "../../src/config/env.js";
import { createDatabaseClient } from "../../src/db/supabase.js";

test(
  "local registration ticket, private DOB, email confirmation and concurrent username claims",
  { skip: process.env.RUN_REGISTRATION_INTEGRATION !== "true", timeout: 60000 },
  async () => {
    const env = loadEnvironment(),
      url = new URL(process.env.GEOGRAPHY_DATABASE_URL ?? "");
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        url.port === "60322",
    );
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(env.SUPABASE_URL).hostname,
      ),
    );
    const db = new pg.Client({ connectionString: url.href }),
      app = buildApp(env, { logger: false });
    await db.connect();
    const ids: string[] = [];
    try {
      const email = `registration-${randomUUID()}@example.test`,
        username = "u" + randomUUID().replaceAll("-", "").slice(0, 20),
        birth = "2000-02-29";
      const prepare = (name: string, address: string) =>
        app.inject({
          method: "POST",
          url: "/api/auth/registration-intent",
          payload: { username: name, email: address, dateOfBirth: birth },
        });
      const prepared = await prepare(username, email);
      assert.equal(prepared.statusCode, 200);
      assert.equal(prepared.body.includes(birth), false);
      const auth = createDatabaseClient(env).auth;
      const signup = await auth.signUp({
        email,
        password: `Rc!${randomUUID()}Z7`,
        options: {
          data: { rollcall_registration_token: prepared.json().token },
        },
      });
      assert.equal(signup.error, null);
      assert.equal(
        signup.data.session,
        null,
        "Confirmation must remain required",
      );
      assert.ok(signup.data.user?.id);
      ids.push(signup.data.user.id);
      // GoTrue can echo the input metadata in its signup response; the consumed
      // opaque ticket must not remain in the persisted Auth record or later JWTs.
      const persistedMetadata = (
        await db.query(
          "select raw_user_meta_data from auth.users where id=$1",
          [signup.data.user.id],
        )
      ).rows[0].raw_user_meta_data;
      assert.equal(persistedMetadata.rollcall_registration_token, undefined);
      assert.equal(signup.data.user.user_metadata.dateOfBirth, undefined);
      const row = (
        await db.query(
          "select username,date_of_birth::text from public.profiles p join private.profile_private d on p.id=d.profile_id where p.id=$1",
          [signup.data.user.id],
        )
      ).rows[0];
      assert.equal(row.username, username);
      assert.equal(row.date_of_birth, birth);
      assert.equal(
        (
          await prepare(
            username.toUpperCase(),
            `other-${randomUUID()}@example.test`,
          )
        ).statusCode,
        409,
      );
      const confirmation = (
        await db.query(
          "select confirmation_token from auth.users where id=$1",
          [signup.data.user.id],
        )
      ).rows[0].confirmation_token;
      const confirmed = await auth.verifyOtp({
        token_hash: confirmation,
        type: "signup",
      });
      assert.equal(confirmed.error, null);
      const token = confirmed.data.session?.access_token;
      assert.ok(token);
      assert.equal(
        JSON.stringify(confirmed.data.session?.user.user_metadata).includes(
          birth,
        ),
        false,
      );
      assert.equal(
        confirmed.data.session?.user.user_metadata.rollcall_registration_token,
        undefined,
      );
      const own = await app.inject({
        url: "/api/me/profile",
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(own.statusCode, 200);
      assert.equal(own.json().hasDateOfBirth, true);
      assert.equal(own.body.includes(birth), false);
      const publicProfile = await app.inject(
        `/api/users/${signup.data.user.id}`,
      );
      assert.equal(publicProfile.statusCode, 200);
      assert.equal(publicProfile.body.includes(birth), false);
      assert.equal(publicProfile.body.includes(email), false);
      const raceName = "r" + randomUUID().replaceAll("-", "").slice(0, 20);
      const races = await Promise.all([
        prepare(raceName, `a-${randomUUID()}@example.test`),
        prepare(raceName.toUpperCase(), `b-${randomUUID()}@example.test`),
      ]);
      assert.deepEqual(
        races.map((result) => result.statusCode).sort(),
        [200, 409],
      );
      const bypass = await createDatabaseClient(env).auth.signUp({
        email: `bypass-${randomUUID()}@example.test`,
        password: `Rc!${randomUUID()}Z7`,
      });
      assert.ok(
        bypass.error,
        "Direct signup without a prepared ticket must fail",
      );
      await db.query(
        "delete from private.registration_intents where username=$1",
        [raceName],
      );
    } finally {
      await app.close();
      await db.query("delete from auth.users where id=any($1::uuid[])", [ids]);
      await db.end();
    }
  },
);
