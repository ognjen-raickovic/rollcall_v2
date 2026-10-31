import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { createDatabaseClient } from "../src/db/supabase.js";
import { ApiError } from "../src/shared/api-error.js";
import {
  createDiscussionRepository,
  type DiscussionRequest,
} from "../src/modules/events/event-discussion.js";
import { testEnvironment } from "./helpers.js";

const eventId = "e5000000-0000-4000-8000-000000000001",
  viewerId = "45000000-0000-4000-8000-000000000002",
  itemId = "45000000-0000-4000-8000-000000000003";
const authorization = "Bearer fixture.jwt.signature";
test("discussion routes validate strict payloads, derive the actor, separate replies, and require verified active authentication", async () => {
  const requests: DiscussionRequest[] = [];
  const app = buildApp(testEnvironment(), {
    logger: false,
    assertActiveAccount: async () => {},
    verifyToken: async () => ({ id: viewerId, email: null }),
    discussion: (token) => async (request) => {
      requests.push(request);
      assert.equal(
        token,
        request.viewerId ? "fixture.jwt.signature" : undefined,
      );
      return { id: itemId };
    },
  });
  try {
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/api/events/${eventId}/comments`,
        })
      ).statusCode,
      200,
    );
    assert.equal(requests[0]?.viewerId, null);
    for (const resource of ["comments", "reviews"]) {
      const url = `/api/events/${eventId}/${resource}`;
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url,
            payload: resource === "comments" ? { body: "Text" } : { rating: 4 },
          })
        ).statusCode,
        401,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url,
            headers: { authorization },
            payload:
              resource === "comments"
                ? { body: "Text", authorId: viewerId }
                : { rating: 6 },
          })
        ).statusCode,
        400,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url,
            headers: { authorization },
            payload: resource === "comments" ? { body: "Text" } : { rating: 4 },
          })
        ).statusCode,
        200,
      );
      assert.equal(requests.at(-1)?.viewerId, viewerId);
      assert.equal(
        (await app.inject({ method: "GET", url: url + "?limit=21" }))
          .statusCode,
        400,
      );
      assert.equal(
        (await app.inject({ method: "GET", url: url + "?cursor=-1" }))
          .statusCode,
        400,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: url + `/${itemId}/hide`,
            headers: { authorization },
            payload: { reason: "x" },
          })
        ).statusCode,
        400,
      );
      assert.equal(
        (
          await app.inject({
            method: "DELETE",
            url: url + `/${itemId}`,
            headers: { authorization },
          })
        ).statusCode,
        200,
      );
    }
    const reply = await app.inject({
      method: "POST",
      url: `/api/events/${eventId}/comments/${itemId}/replies`,
      headers: { authorization },
      payload: { body: "Reply" },
    });
    assert.equal(reply.statusCode, 200);
    assert.equal(reply.headers["cache-control"], "no-store");
    assert.equal(reply.headers.vary, "Authorization");
    assert.equal(requests.at(-1)?.input.parentId, itemId);
    assert.equal(requests.at(-1)?.input.id, undefined);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/events/${eventId}/comments`,
          headers: { authorization },
          payload: { body: "x".repeat(2001) },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/events/${eventId}/comments`,
          headers: { authorization },
          payload: { body: "Bad\u0000text" },
        })
      ).statusCode,
      400,
    );
  } finally {
    await app.close();
  }
});

test("discussion endpoints preserve rate-limit feedback and live suspension errors", async () => {
  const app = buildApp(testEnvironment(), {
    logger: false,
    verifyToken: async () => ({ id: viewerId, email: null }),
    assertActiveAccount: async () => {},
    discussion: () => async () => {
      throw new ApiError(429, "RATE_LIMITED", "Too many changes.");
    },
  });
  try {
    const r = await app.inject({
      method: "POST",
      url: `/api/events/${eventId}/reviews`,
      headers: { authorization },
      payload: { rating: 3 },
    });
    assert.equal(r.statusCode, 429);
    assert.equal(r.headers["retry-after"], "900");
  } finally {
    await app.close();
  }
  const suspended = buildApp(testEnvironment(), {
    logger: false,
    verifyToken: async () => ({ id: viewerId, email: null }),
    assertActiveAccount: async () => {
      throw new ApiError(403, "ACCOUNT_SUSPENDED", "Suspended");
    },
    discussion: () => async () => {
      assert.fail("Suspended caller reached repository");
    },
  });
  try {
    assert.equal(
      (
        await suspended.inject({
          method: "POST",
          url: `/api/events/${eventId}/comments`,
          headers: { authorization },
          payload: { body: "Test" },
        })
      ).statusCode,
      403,
    );
  } finally {
    await suspended.close();
  }
});

test("discussion repository maps durable SQL outcomes and never exposes raw dependency errors or hidden bodies", async () => {
  const env = testEnvironment();
  const request: DiscussionRequest = {
    eventId,
    kind: "comments",
    operation: "create",
    input: { body: "Hello" },
    viewerId,
  };
  for (const [code, status] of [
    ["limited", 429],
    ["closed", 409],
    ["duplicate", 409],
    ["forbidden", 403],
    ["not_found", 404],
  ] as const) {
    const repo = createDiscussionRepository(
      createDatabaseClient(env, async () => Response.json({ errorCode: code })),
    );
    await assert.rejects(
      repo(request),
      (e: unknown) => e instanceof ApiError && e.status === status,
    );
  }
  const failed = createDiscussionRepository(
    createDatabaseClient(env, async () =>
      Response.json(
        { code: "XX000", message: "PRIVATE INTERNAL DETAIL" },
        { status: 500 },
      ),
    ),
  );
  await assert.rejects(
    failed(request),
    (e: unknown) =>
      e instanceof ApiError &&
      e.status === 503 &&
      !e.message.includes("PRIVATE"),
  );
  const response = {
    eventId,
    viewerId,
    kind: "comments",
    nextCursor: null,
    permissions: {
      commentsOpen: true,
      reviewsOpen: false,
      canComment: true,
      canReview: false,
      canModerateComments: false,
      canModerateReviews: false,
      serverTime: "2030-01-01T00:00:00Z",
      endsAt: "2030-01-02T00:00:00Z",
      cancelled: false,
    },
    items: [
      {
        id: itemId,
        author: { id: viewerId, displayName: "Player" },
        body: "HIDDEN SECRET",
        deleted: false,
        hidden: true,
        createdAt: "2030-01-01T00:00:00Z",
        editedAt: null,
        parentId: null,
        isHost: false,
        replyCount: 0,
        canEdit: false,
        canDelete: true,
      },
    ],
  };
  const unsafe = createDiscussionRepository(
    createDatabaseClient(env, async () => Response.json(response)),
  );
  await assert.rejects(
    unsafe({ ...request, operation: "list", input: {} }),
    (e: unknown) => e instanceof ApiError && e.status === 503,
  );
  const firstItem = response.items[0];
  assert.ok(firstItem);
  firstItem.hidden = false;
  const valid = createDiscussionRepository(
    createDatabaseClient(env, async () =>
      Response.json({ ...response, email: "never project" }),
    ),
  );
  const projected = await valid({ ...request, operation: "list", input: {} });
  assert.equal(JSON.stringify(projected).includes("never project"), false);
  const mismatch = createDiscussionRepository(
    createDatabaseClient(env, async () =>
      Response.json({ ...response, viewerId: itemId }),
    ),
  );
  await assert.rejects(
    mismatch({ ...request, operation: "list", input: {} }),
    ApiError,
  );
});
