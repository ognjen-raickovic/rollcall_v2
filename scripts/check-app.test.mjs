import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:net";
import { once } from "node:events";
import {
  stagingConfig,
  childEnvironments,
  validateProject,
  verifyPublicKey,
} from "./application-config.mjs";
import { assertPortFree, startServices } from "./run-app.mjs";

const ref = "a".repeat(20);
const settings = {
  SUPABASE_PROJECT_REF: ref,
  SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_fixture",
  EVENT_COVER_OPERATION_KEY: "c".repeat(43),
  EVENT_INVITATION_KEY: "i".repeat(43),
};
test("staging app config rejects operator fields, mismatched projects and privileged keys; Vite never receives runtime roots", () => {
  assert.equal(stagingConfig(settings), settings);
  for (const patch of [
    { GEOGRAPHY_DATABASE_URL: "forbidden" },
    { ROLLCALL_STAGING_DATABASE_URL: "forbidden" },
    { SUPABASE_URL: "http://127.0.0.1:55321" },
    { SUPABASE_PUBLISHABLE_KEY: "sb_secret_synthetic" },
    { SUPABASE_PROJECT_REF: "b".repeat(20) },
  ])
    assert.throws(() => stagingConfig({ ...settings, ...patch }));
  assert.throws(() =>
    validateProject(
      settings.SUPABASE_URL,
      settings.SUPABASE_PUBLISHABLE_KEY,
      "local",
    ),
  );
  const env = childEnvironments(settings, 5173, 3001);
  assert.equal(
    env.frontend.VITE_SUPABASE_PUBLISHABLE_KEY,
    env.backend.SUPABASE_PUBLISHABLE_KEY,
  );
  assert.equal(env.frontend.EVENT_COVER_OPERATION_KEY, undefined);
  assert.equal(env.frontend.EVENT_INVITATION_KEY, undefined);
  assert.equal(env.frontend.VITE_ENABLE_DEMO_MODE, "false");
});
test("opaque public keys are checked only with a read-only request; 401 is reported without echoing the key", async () => {
  await verifyPublicKey(settings, async (url, options) => {
    assert.equal(url.pathname, "/auth/v1/settings");
    assert.equal(options.method, undefined);
    assert.equal(options.headers.apikey, settings.SUPABASE_PUBLISHABLE_KEY);
    return Response.json({ external: { email: true } });
  });
  await assert.rejects(
    verifyPublicKey(settings, async () => new Response("", { status: 401 })),
    (error) =>
      error.message.includes("401") &&
      !error.message.includes(settings.SUPABASE_PUBLISHABLE_KEY),
  );
});
test("startup reports occupied ports without silently changing the frontend origin", async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await assert.rejects(
      assertPortFree(server.address().port, "127.0.0.1", "Backend"),
      /unavailable/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test(
  "single-command supervisor starts both services with synthetic configuration and stops both process trees",
  { timeout: 30000 },
  async () => {
    const allocate = async () => {
      const s = createServer();
      s.listen(0, "127.0.0.1");
      await once(s, "listening");
      const p = s.address().port;
      await new Promise((resolve) => s.close(resolve));
      return p;
    };
    const front = await allocate(),
      back = await allocate(),
      running = startServices(settings, front, back, "test");
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          ready =
            (
              await fetch(`http://127.0.0.1:${back}/health`, {
                signal: AbortSignal.timeout(300),
              })
            ).ok &&
            (
              await fetch(`http://localhost:${front}/login`, {
                signal: AbortSignal.timeout(300),
              })
            ).ok;
        } catch {
          /* Bounded local startup only. */
        }
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(ready, true);
    } finally {
      await running.stop(0);
    }
    for (const child of running.children) {
      if (child.exitCode === null) await once(child, "exit");
      assert.notEqual(child.exitCode, null);
    }
  },
);
