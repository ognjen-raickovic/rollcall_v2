import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { buildApp } from "../../src/app.js";
import { loadEnvironment } from "../../src/config/env.js";
import { createDatabaseClient } from "../../src/db/supabase.js";

test(
  "isolated Auth + PostgREST + Fastify discussion lifecycle and direct Data API boundaries",
  { skip: process.env.RUN_DISCUSSION_INTEGRATION !== "true", timeout: 90000 },
  async () => {
    const env = loadEnvironment(),
      url = new URL(process.env.DISCUSSION_TEST_DATABASE_URL ?? "");
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.port, "61322");
    assert.equal(new URL(env.SUPABASE_URL).origin, "http://127.0.0.1:61321");
    const db = new pg.Client({ connectionString: url.href }),
      app = buildApp(env, { logger: false }),
      ids: string[] = [],
      events: string[] = [];
    await db.connect();
    try {
      assert.ok(env.EVENT_COVER_OPERATION_KEY);
      await db.query(
        "insert into private.event_cover_config(singleton,operation_key_hash) values(true,$1) on conflict(singleton) do update set operation_key_hash=excluded.operation_key_hash",
        [
          createHash("sha256")
            .update(env.EVENT_COVER_OPERATION_KEY)
            .digest("hex"),
        ],
      );
      async function account() {
        const username = "Player_" + randomBytes(5).toString("hex"),
          email = username + "@example.test",
          password =
            "Local-test-" + randomBytes(12).toString("base64url") + "!";
        const prepared = await app.inject({
          method: "POST",
          url: "/api/auth/registration-intent",
          payload: { username, email, dateOfBirth: "2000-01-01" },
        });
        assert.equal(prepared.statusCode, 200, "Registration preparation");
        const client = createDatabaseClient(env);
        const registered = await client.auth.signUp({
          email,
          password,
          options: {
            data: { rollcall_registration_token: prepared.json().token },
          },
        });
        assert.equal(registered.error, null, "Local Auth registration");
        assert.ok(registered.data.user);
        const id = registered.data.user.id;
        ids.push(id);
        // Disposable accounts only. Hosted confirmation remains untouched.
        await db.query(
          "update auth.users set email_confirmed_at=clock_timestamp() where id=$1",
          [id],
        );
        const login = await client.auth.signInWithPassword({ email, password });
        assert.equal(login.error, null);
        assert.ok(login.data.session);
        return { id, token: login.data.session.access_token };
      }
      const host = await account(),
        player = await account(),
        outsider = await account();
      const headers = (who: typeof host) => ({
        authorization: "Bearer " + who.token,
      });
      const city = (
        await db.query("select id from public.cities order by id limit 1")
      ).rows[0].id as number;
      const start = Date.now() + 6000,
        end = start + 6000;
      const created = await app.inject({
        method: "POST",
        url: "/api/events",
        headers: headers(host),
        payload: {
          title: "Real API discussion test",
          description:
            "Synthetic isolated discussion and review integration fixture.",
          gameId: 1,
          cityId: city,
          address: "Synthetic integration address",
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(end).toISOString(),
          capacity: 5,
          experienceLevel: "all-levels",
        },
      });
      assert.equal(created.statusCode, 201, created.json().code);
      const eventId = created.json().id as string;
      events.push(eventId);
      const base = "/api/events/" + eventId;
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: base + "/attendees/me",
            headers: headers(player),
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (await app.inject({ method: "GET", url: base + "/comments" }))
          .statusCode,
        200,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: base + "/comments",
            payload: { body: "Guest" },
          })
        ).statusCode,
        401,
      );
      const comment = await app.inject({
        method: "POST",
        url: base + "/comments",
        headers: headers(player),
        payload: { body: "Before start" },
      });
      assert.equal(comment.statusCode, 200);
      const commentId = comment.json().id as string;
      assert.equal(
        (
          await app.inject({
            method: "PATCH",
            url: base + "/comments/" + commentId,
            headers: headers(outsider),
            payload: { body: "Stolen" },
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: base + "/reviews",
            headers: headers(player),
            payload: { rating: 4 },
          })
        ).statusCode,
        409,
      );
      const direct = createDatabaseClient(env, fetch, player.token);
      const raw = await direct.schema("public").from("events").select("id");
      assert.ok(raw.error, "Unprivileged Data API cannot read raw events");
      const invalid = await direct.rpc("event_discussion", {
        p_event_id: eventId,
        p_kind: "comments",
        p_operation: "create",
        p_input: { body: "Forged", authorId: host.id },
      });
      assert.ok(invalid.error, "Direct RPC cannot submit actor identity");
      while (Date.now() < start + 50) await delay(60);
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: base + "/comments",
            headers: headers(player),
            payload: { body: "During event" },
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: base + "/reviews",
            headers: headers(player),
            payload: { rating: 4 },
          })
        ).statusCode,
        409,
      );
      while (Date.now() < end + 50) await delay(60);
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: base + "/comments",
            headers: headers(player),
            payload: { body: "After end" },
          })
        ).statusCode,
        409,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: base + "/reviews",
            headers: headers(host),
            payload: { rating: 5 },
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: base + "/reviews",
            headers: headers(outsider),
            payload: { rating: 5 },
          })
        ).statusCode,
        403,
      );
      const review = await app.inject({
        method: "POST",
        url: base + "/reviews",
        headers: headers(player),
        payload: { rating: 4, body: "A good table" },
      });
      assert.equal(review.statusCode, 200);
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: base + "/reviews",
            headers: headers(player),
            payload: { rating: 4 },
          })
        ).statusCode,
        409,
      );
      const listed = await app.inject({
        method: "GET",
        url: base + "/reviews",
      });
      assert.equal(listed.statusCode, 200);
      assert.equal(listed.json().items[0].rating, 4);
      assert.equal(listed.body.includes("dateOfBirth"), false);
      assert.equal(listed.body.includes("@example.test"), false);
      assert.equal(
        (
          await app.inject({
            method: "DELETE",
            url: base + "/reviews/" + review.json().id,
            headers: headers(player),
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (await app.inject({ method: "GET", url: base + "/reviews" })).json()
          .items[0].body,
        null,
      );
    } finally {
      await app.close();
      if (events.length)
        await db.query("delete from public.events where id=any($1::uuid[])", [
          events,
        ]);
      if (ids.length)
        await db.query("delete from auth.users where id=any($1::uuid[])", [
          ids,
        ]);
      await db.end();
    }
  },
);
