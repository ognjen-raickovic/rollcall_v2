import assert from "node:assert/strict";
import test from "node:test";
import { registrationSchema } from "../src/modules/auth/registration.js";
import { buildApp } from "../src/app.js";
import { testEnvironment } from "./helpers.js";

test("registration preserves trimmed username casing and validates private dates without accepting actor/role fields", () => {
  const valid = {
    username: " Player_One ",
    email: "fixture@example.test",
    dateOfBirth: "2000-02-29",
  };
  assert.equal(registrationSchema.parse(valid).username, "Player_One");
  for (const patch of [
    { username: "a" },
    { username: "9player" },
    { username: "a space" },
    { dateOfBirth: "2001-02-29" },
    { dateOfBirth: "2100-01-01" },
    { dateOfBirth: "" },
    { role: "superadmin" },
    { userId: "submitted" },
  ])
    assert.equal(
      registrationSchema.safeParse({ ...valid, ...patch }).success,
      false,
    );
});
test("registration preparation fails safely without backend capability and never returns submitted private data", async () => {
  const app = buildApp(testEnvironment(), { logger: false });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/registration-intent",
      payload: {
        username: "fixture_user",
        email: "fixture@example.test",
        dateOfBirth: "2000-02-29",
      },
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.body.includes("2000-02-29"), false);
    assert.equal(response.body.includes("fixture@example.test"), false);
  } finally {
    await app.close();
  }
});
