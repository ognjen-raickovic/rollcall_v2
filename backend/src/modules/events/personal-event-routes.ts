import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Environment } from "../../config/env.js";
import { createDatabaseClient } from "../../db/supabase.js";
import { ApiError, parseInput } from "../../shared/api-error.js";
import { createAuthGuard } from "../auth/auth-guard.js";
import type { TokenVerifier } from "../auth/types.js";
import { throwIfSuspended } from "../auth/account-status.js";
import {
  cursorPositionSchema,
  encodeEventCursor,
  eventCursorSchema,
} from "./event-pagination.js";
import { eventSummarySchema } from "./event-schema.js";

export const personalEventsSchema = z
  .strictObject({
    relation: z.enum(["hosting", "joined"]).default("hosting"),
    period: z.enum(["upcoming", "past", "all"]).default("upcoming"),
    sort: z.enum(["soonest", "latest"]).default("soonest"),
    limit: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(50))
      .default(12),
    cursor: eventCursorSchema.optional(),
  })
  .refine((value) => !value.cursor || value.cursor.sort === value.sort, {
    path: ["cursor"],
    message: "Cursor ordering does not match sort.",
  });
const pageSchema = z.object({
  items: z.array(eventSummarySchema).max(50),
  hasMore: z.boolean(),
  position: cursorPositionSchema.optional(),
});
export function registerPersonalEventRoutes(
  app: FastifyInstance,
  env: Environment,
  verify: TokenVerifier,
) {
  app.get(
    "/api/me/events",
    { preHandler: createAuthGuard(verify) },
    async (request) => {
      const { cursor, ...filters } = parseInput(
        personalEventsSchema,
        request.query,
      );
      const client = createDatabaseClient(
        env,
        fetch,
        request.headers.authorization?.slice(7),
      );
      const { data, error } = await client.rpc("my_events", {
        p_filters: {
          ...filters,
          ...(cursor
            ? { afterStartsAt: cursor.startsAt, afterId: cursor.id }
            : {}),
        },
      });
      throwIfSuspended(error);
      if (error?.code === "42501")
        throw new ApiError(
          403,
          "FORBIDDEN",
          "This account cannot access personal events.",
        );
      if (error)
        throw new ApiError(
          503,
          "DEPENDENCY_UNAVAILABLE",
          "Your events are temporarily unavailable.",
        );
      const parsed = pageSchema.safeParse(data);
      if (
        !parsed.success ||
        parsed.data.items.length > filters.limit ||
        (parsed.data.hasMore &&
          (!parsed.data.items.length || !parsed.data.position)) ||
        (parsed.success &&
          parsed.data.position &&
          (parsed.data.position.id !== parsed.data.items.at(-1)?.id ||
            parsed.data.position.sort !== filters.sort))
      )
        throw new ApiError(
          503,
          "DEPENDENCY_UNAVAILABLE",
          "Your events returned an invalid response.",
        );
      const page = parsed.data;
      return {
        items: page.items,
        pageInfo: {
          limit: filters.limit,
          nextCursor:
            page.hasMore && page.position
              ? encodeEventCursor(page.position)
              : null,
        },
      };
    },
  );
}
