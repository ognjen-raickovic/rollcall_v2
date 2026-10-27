import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import type { LightMyRequestResponse } from 'fastify';
import { buildApp } from "../../src/app.js";
import { loadEnvironment } from "../../src/config/env.js";
import { createDatabaseClient } from "../../src/db/supabase.js";
import { signUpFixture } from "./registration-fixture.js";

test(
  "disposable HTTP discovery sorts globally and My Events enforces current verified membership",
  { skip: process.env.RUN_DISCOVERY_INTEGRATION !== "true", timeout: 60000 },
  async () => {
    const env = loadEnvironment(),
      url = new URL(process.env.GEOGRAPHY_DATABASE_URL ?? "");
    assert.ok(
      url.hostname === "127.0.0.1" &&
        url.port === "60322" &&
        new URL(env.SUPABASE_URL).port === "60321",
    );
    const db = new pg.Client({ connectionString: url.href }),
      app = buildApp(env, { logger: false }),
      accounts: { id: string; token: string }[] = [],
      events: string[] = [];
    await db.connect();
    try {
      for (let i = 0; i < 2; i++) {
        const client = createDatabaseClient(env),
          email = `discovery-${randomUUID()}@example.test`,
          password = `Rc!${randomUUID()}Z7`;
        const signed = await signUpFixture(client.auth, db, {
          email,
          password,
        });
        assert.equal(signed.error, null);
        assert.ok(signed.data.user);
        await db.query(
          "update auth.users set email_confirmed_at=now() where id=$1",
          [signed.data.user.id],
        );
        const login = await client.auth.signInWithPassword({ email, password });
        assert.equal(login.error, null);
        assert.ok(login.data.session);
        accounts.push({
          id: signed.data.user.id,
          token: login.data.session.access_token,
        });
      }
      const host = accounts[0],
        member = accounts[1],
        headers = (token: string) => ({ authorization: `Bearer ${token}` });
      assert.ok(host && member);
      const city = (
        await db.query(
          "select city.id from public.cities city join public.countries c on c.id=city.country_id where c.iso_code='ME' and city.name='Podgorica' order by city.id limit 1",
        )
      ).rows[0].id;
      const prefix = "HTTP " + randomUUID().slice(0, 8) + " ",
        summaries: { id: string; title: string }[] = [];
      for (const [index, name] of [
        "Zeta",
        "Alpha",
        "alpha",
        "Omega",
        "Beta",
        "Private",
      ].entries()) {
        const start = new Date(Date.now() + 604800000 + index * 3600000);
        const response: LightMyRequestResponse = await app.inject({
          method: "POST",
          url: "/api/events",
          headers: headers(host.token),
          payload: {
            title: prefix + name,
            description:
              "A realistic synthetic table used for checked integration.",
            gameId: 1,
            cityId: city,
            address: "Synthetic protected venue address",
            startsAt: start.toISOString(),
            endsAt: new Date(start.getTime() + 7200000).toISOString(),
            capacity: 4,
            visibility: name === "Private" ? "private" : "public",
            tags: index < 2 ? ["Casual", "One-shot"] : ["Casual"],
            minimumAge: index === 4 ? 18 : 0,
            experienceLevel: "all-levels",
          },
        });
        assert.equal(response.statusCode, 201);
        events.push(response.json().id);
        if (name !== "Private")
          summaries.push({
            id: response.json().id,
            title: response.json().title,
          });
      }
      const expected = [...summaries].sort((a, b) =>
        a.title.toLowerCase() < b.title.toLowerCase()
          ? -1
          : a.title.toLowerCase() > b.title.toLowerCase()
            ? 1
            : a.id < b.id
              ? -1
              : 1,
      );
      let cursor: string | null = null;
      const seen: string[] = [];
      do {
        const params = new URLSearchParams({
          search: prefix.trim(),
          sort: "title-asc",
          limit: "2",
        });
        if (cursor) params.set("cursor", cursor);
        const page = await app.inject("/api/events?" + params);
        assert.equal(page.statusCode, 200);
        assert.equal(page.body.includes("protected venue"), false);
        seen.push(...page.json().items.map((item: { id: string }) => item.id));
        cursor = page.json().pageInfo.nextCursor;
        if (cursor)
          assert.equal(
            (await app.inject("/api/events?sort=latest&cursor=" + cursor))
              .statusCode,
            400,
          );
      } while (cursor);
      assert.deepEqual(
        seen,
        expected.map((item) => item.id),
      );
      assert.equal(new Set(seen).size, 5);
      assert.equal(
        (
          await app.inject(
            "/api/events?" +
              new URLSearchParams({
                search: prefix.trim(),
                tags: "Casual,One-shot",
              }),
          )
        ).json().items.length,
        2,
      );
      assert.equal(
        (
          await app.inject(
            "/api/events?" +
              new URLSearchParams({
                search: prefix.trim(),
                maxMinimumAge: "12",
              }),
          )
        ).json().items.length,
        4,
      );
      assert.equal((await app.inject("/api/me/events")).statusCode, 401);
      assert.equal(
        (
          await app.inject({
            url: "/api/me/events?userId=" + host.id,
            headers: headers(member.token),
          })
        ).statusCode,
        400,
      );
      const mine = await app.inject({
        url: "/api/me/events?relation=hosting",
        headers: headers(host.token),
      });
      assert.equal(mine.statusCode, 200);
      assert.equal(mine.json().items.length, 6);
      const privateId = events.at(-1);
      assert.ok(privateId);
      const joined = () =>
        app.inject({
          url: "/api/me/events?relation=joined",
          headers: headers(member.token),
        });
      assert.equal((await joined()).json().items.length, 0);
      await db.query(
        "insert into public.event_participants(event_id,profile_id) values($1,$2)",
        [privateId, member.id],
      );
      assert.equal((await joined()).json().items[0].id, privateId);
      await db.query(
        "delete from public.event_participants where event_id=$1 and profile_id=$2",
        [privateId, member.id],
      );
      assert.equal((await joined()).json().items.length, 0);
      await db.query(
        "insert into private.account_suspensions(profile_id,status,suspended_at,suspended_by,suspension_reason) values($1,'suspended',now(),$2,'Synthetic API denial check')",
        [member.id, host.id],
      );
      assert.equal((await joined()).statusCode, 403);
    } finally {
      await app.close();
      await db.query("delete from public.events where id=any($1::uuid[])", [
        events,
      ]);
      await db.query("delete from auth.users where id=any($1::uuid[])", [
        accounts.map((item) => item.id),
      ]);
      await db.end();
    }
  },
);
