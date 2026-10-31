import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "../../db/supabase.js";
import { ApiError, parseInput } from "../../shared/api-error.js";
import { createAuthGuard } from "../auth/auth-guard.js";
import { throwIfSuspended } from "../auth/account-status.js";
import type { TokenVerifier } from "../auth/types.js";

const text = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) =>
      Array.from(value).every((character) => {
        const code = character.charCodeAt(0);
        return (
          code === 9 ||
          code === 10 ||
          code === 13 ||
          (code >= 32 && code !== 127)
        );
      }),
    "Use plain text without control characters.",
  );
export const commentInput = z.strictObject({ body: text.min(1) });
export const reviewInput = z.strictObject({
  rating: z.number().int().min(1).max(5),
  body: text.nullable().optional(),
});
const reasonInput = z.strictObject({
  reason: z.string().trim().min(5).max(500),
});
const pageInput = z.strictObject({
  cursor: z
    .string()
    .regex(/^[0-9]{1,18}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
const paramsInput = z.strictObject({
  eventId: z.uuid(),
  itemId: z.uuid().optional(),
});
const author = z
  .object({ id: z.uuid(), displayName: z.string().min(1).max(80) })
  .nullable();
const common = z.object({
  id: z.uuid(),
  author,
  body: z.string().nullable(),
  deleted: z.boolean(),
  hidden: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  editedAt: z.iso.datetime({ offset: true }).nullable(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});
const safeBody = (value: {
  deleted: boolean;
  hidden: boolean;
  body: string | null;
}) => !(value.deleted || value.hidden) || value.body === null;
const comment = common
  .extend({
    parentId: z.uuid().nullable(),
    isHost: z.boolean(),
    replyCount: z.number().int().nonnegative(),
  })
  .refine(safeBody);
const review = common
  .extend({ rating: z.number().int().min(1).max(5).nullable() })
  .refine(
    (value) =>
      safeBody(value) &&
      (!(value.deleted || value.hidden) || value.rating === null),
  );
const permissions = z.object({
  commentsOpen: z.boolean(),
  reviewsOpen: z.boolean(),
  canComment: z.boolean(),
  canReview: z.boolean(),
  canModerateComments: z.boolean(),
  canModerateReviews: z.boolean(),
  serverTime: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  cancelled: z.boolean(),
});
const page = z.object({
  eventId: z.uuid(),
  viewerId: z.uuid().nullable(),
  kind: z.enum(["comments", "reviews"]),
  items: z.array(z.unknown()).max(20),
  permissions,
  nextCursor: z
    .string()
    .regex(/^[0-9]{1,18}$/)
    .nullable(),
});
const acknowledgement = z.object({
  eventId: z.uuid(),
  viewerId: z.uuid(),
  id: z.uuid(),
});
export type DiscussionKind = "comments" | "reviews";
export type DiscussionOperation =
  "list" | "create" | "edit" | "delete" | "hide";
export type DiscussionRequest = {
  eventId: string;
  kind: DiscussionKind;
  operation: DiscussionOperation;
  input: Record<string, unknown>;
  viewerId: string | null;
};
export type DiscussionRepository = (
  request: DiscussionRequest,
) => Promise<unknown>;
function unavailable() {
  return new ApiError(
    503,
    "DEPENDENCY_UNAVAILABLE",
    "Discussion is temporarily unavailable. Try again shortly.",
  );
}

export function createDiscussionRepository(
  client: DatabaseClient,
): DiscussionRepository {
  return async (request) => {
    let response;
    try {
      response = await client.rpc("event_discussion", {
        p_event_id: request.eventId,
        p_kind: request.kind,
        p_operation: request.operation,
        p_input: request.input as Record<string, string | number | null>,
      });
    } catch {
      throw unavailable();
    }
    if (response.error) {
      throwIfSuspended(response.error);
      if (response.error.code === "42501")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "You cannot perform this discussion action.",
        );
      if (response.error.code.startsWith("22"))
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Check the discussion fields.",
        );
      throw unavailable();
    }
    const failure = z
      .object({
        errorCode: z.enum([
          "limited",
          "not_found",
          "closed",
          "forbidden",
          "duplicate",
        ]),
      })
      .safeParse(response.data);
    if (failure.success) {
      const errors = {
        limited: [
          429,
          "RATE_LIMITED",
          "Too many discussion changes. Wait before trying again.",
        ],
        not_found: [404, "NOT_FOUND", "This discussion is unavailable."],
        closed: [
          409,
          "CONFLICT",
          "This action is unavailable for the current event or discussion state.",
        ],
        forbidden: [
          403,
          "FORBIDDEN",
          "You are not eligible to perform this discussion action.",
        ],
        duplicate: [
          409,
          "CONFLICT",
          "You already reviewed this event. Edit your existing review.",
        ],
      } as const;
      const [status, code, message] = errors[failure.data.errorCode];
      throw new ApiError(status, code, message);
    }
    if (request.operation === "list") {
      const parsed = page.safeParse(response.data);
      if (
        !parsed.success ||
        parsed.data.eventId !== request.eventId ||
        parsed.data.viewerId !== request.viewerId ||
        parsed.data.kind !== request.kind
      )
        throw unavailable();
      const items = z
        .array(request.kind === "comments" ? comment : review)
        .safeParse(parsed.data.items);
      if (!items.success) throw unavailable();
      return { ...parsed.data, items: items.data };
    }
    const parsed = acknowledgement.safeParse(response.data);
    if (
      !parsed.success ||
      parsed.data.eventId !== request.eventId ||
      parsed.data.viewerId !== request.viewerId ||
      (request.input.id && parsed.data.id !== request.input.id)
    )
      throw unavailable();
    return parsed.data;
  };
}

export function registerDiscussionRoutes(
  app: FastifyInstance,
  options: {
    verify: TokenVerifier;
    repository: (token?: string) => DiscussionRepository;
  },
) {
  const guard = createAuthGuard(options.verify);
  for (const kind of ["comments", "reviews"] as const) {
    const base = `/api/events/:eventId/${kind}`;
    const definitions: {
      method: "GET" | "POST" | "PATCH" | "DELETE";
      path: string;
      operation: DiscussionOperation;
      reply?: boolean;
    }[] = [
      { method: "GET", path: base, operation: "list" },
      { method: "POST", path: base, operation: "create" },
      { method: "PATCH", path: base + "/:itemId", operation: "edit" },
      { method: "DELETE", path: base + "/:itemId", operation: "delete" },
      { method: "POST", path: base + "/:itemId/hide", operation: "hide" },
      ...(kind === "comments"
        ? [
            {
              method: "GET" as const,
              path: base + "/:itemId/replies",
              operation: "list" as const,
              reply: true,
            },
            {
              method: "POST" as const,
              path: base + "/:itemId/replies",
              operation: "create" as const,
              reply: true,
            },
          ]
        : []),
    ];
    for (const definition of definitions)
      app.route({
        method: definition.method,
        url: definition.path,
        preHandler: async (request, reply) => {
          reply
            .header("Cache-Control", "no-store")
            .header("Vary", "Authorization");
          if (
            definition.operation !== "list" ||
            request.headers.authorization !== undefined
          )
            await guard.call(app, request, reply, () => {});
        },
        handler: async (request, reply) => {
          const { eventId, itemId } = parseInput(paramsInput, request.params);
          const input: Record<string, unknown> =
            definition.operation === "list"
              ? parseInput(pageInput, request.query)
              : {};
          if (definition.operation !== "list")
            parseInput(z.strictObject({}), request.query);
          if (
            definition.operation === "create" ||
            definition.operation === "edit"
          )
            Object.assign(
              input,
              kind === "comments"
                ? parseInput(commentInput, request.body)
                : parseInput(reviewInput, request.body),
            );
          else if (definition.operation === "hide")
            Object.assign(input, parseInput(reasonInput, request.body));
          else if (
            definition.operation === "delete" &&
            request.body !== undefined
          )
            parseInput(z.strictObject({}), request.body);
          if (itemId) input[definition.reply ? "parentId" : "id"] = itemId;
          try {
            return await options.repository(
              request.account
                ? request.headers.authorization?.slice(7)
                : undefined,
            )({
              eventId,
              kind,
              operation: definition.operation,
              input,
              viewerId: request.account?.id ?? null,
            });
          } catch (error) {
            if (error instanceof ApiError && error.status === 429)
              reply.header("Retry-After", "900");
            throw error;
          }
        },
      });
  }
}
