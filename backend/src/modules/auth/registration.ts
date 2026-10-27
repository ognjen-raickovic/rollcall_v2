import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Environment } from "../../config/env.js";
import type { Database } from "../../db/database.types.js";
import { ApiError, parseInput } from "../../shared/api-error.js";

export const registrationSchema = z.strictObject({
  username: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z][A-Za-z0-9_]{2,23}$/,
      "Use 3–24 letters, numbers or underscores, starting with a letter.",
    ),
  email: z.email().trim().max(254),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const parsed = new Date(value + "T00:00:00Z");
      return (
        Number.isFinite(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value &&
        value >= "1900-01-01" &&
        value <= new Date().toISOString().slice(0, 10)
      );
    }, "Enter a real birth date from 1900 through today."),
});

export function registerRegistrationRoutes(
  app: FastifyInstance,
  env: Environment,
) {
  app.post("/api/auth/registration-intent", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const input = parseInput(registrationSchema, request.body);
    if (!env.EVENT_COVER_OPERATION_KEY)
      throw new ApiError(
        503,
        "DEPENDENCY_UNAVAILABLE",
        "Registration setup is incomplete. Contact the staging operator.",
      );
    const client = createClient<Database>(
      env.SUPABASE_URL,
      env.SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: { "x-rollcall-cover-key": env.EVENT_COVER_OPERATION_KEY },
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              signal: AbortSignal.timeout(env.SUPABASE_TIMEOUT_MS),
            }),
        },
      },
    );
    const { data, error } = await client.rpc("prepare_registration", {
      p_username: input.username,
      p_email: input.email,
      p_date_of_birth: input.dateOfBirth,
      p_fingerprint: createHmac("sha256", env.EVENT_COVER_OPERATION_KEY)
        .update("registration:" + request.ip)
        .digest("hex"),
    });
    if (error)
      throw new ApiError(
        503,
        "DEPENDENCY_UNAVAILABLE",
        "Registration preparation is unavailable. The staging operator must verify its migration and runtime setup.",
      );
    const result = z
      .discriminatedUnion("status", [
        z.object({ status: z.literal("ready"), token: z.uuid() }),
        z.object({ status: z.literal("duplicate") }),
        z.object({ status: z.literal("limited") }),
      ])
      .safeParse(data);
    if (!result.success)
      throw new ApiError(
        503,
        "DEPENDENCY_UNAVAILABLE",
        "Registration is temporarily unavailable.",
      );
    if (result.data.status === "duplicate")
      throw new ApiError(409, "CONFLICT", "Choose another username.", {
        username: ["This username is unavailable. Choose another."],
      });
    if (result.data.status === "limited")
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Too many registration attempts. Please wait before trying again.",
      );
    return { token: result.data.token };
  });
}
