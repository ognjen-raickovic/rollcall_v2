// Local fixture maintenance only: existing domain suites exercise legacy profiles.
// Dedicated registration tests verify the new DOB-preserving flow without this helper.
import { randomUUID, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "pg";

export async function insertAuthFixture(
  db: Client,
  id: string,
  email: string,
  confirmed: boolean,
) {
  const token = randomUUID();
  await db.query(
    "insert into private.registration_intents(token,username,email_hash,date_of_birth) values($1,$2,encode(extensions.digest(lower($3),'sha256'),'hex'),'2000-01-01')",
    [
      token,
      "u" + createHash("sha256").update(id).digest("hex").slice(0, 23),
      email,
    ],
  );
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,case when $3 then now() else null end,$4)",
    [
      id,
      email,
      confirmed,
      JSON.stringify({ rollcall_registration_token: token }),
    ],
  );
}

export async function signUpFixture(
  auth: SupabaseClient["auth"],
  db: Client,
  credentials: {
    email: string;
    password: string;
    options?: { data?: Record<string, unknown>; emailRedirectTo?: string };
  },
) {
  const token = randomUUID(),
    username =
      "u" + createHash("sha256").update(token).digest("hex").slice(0, 23);
  await db.query(
    "insert into private.registration_intents(token,username,email_hash,date_of_birth) values($1,$2,encode(extensions.digest(lower($3),'sha256'),'hex'),'2000-01-01')",
    [token, username, credentials.email],
  );
  const result = await auth.signUp({
    ...credentials,
    options: {
      ...credentials.options,
      data: {
        ...credentials.options?.data,
        rollcall_registration_token: token,
      },
    },
  });
  if (result.data.user?.id) {
    await db.query("delete from private.profile_private where profile_id=$1", [
      result.data.user.id,
    ]);
    await db.query(
      "update public.profiles set display_name='RollCall player' where id=$1",
      [result.data.user.id],
    );
  }
  // A duplicate-email anti-enumeration response may not have consumed its intent.
  await db.query("delete from private.registration_intents where token=$1", [
    token,
  ]);
  return result;
}
