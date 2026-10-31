// Real PostgreSQL transactions, restricted to an explicitly named disposable stack.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const container = process.env.ROLLCALL_TEST_CONTAINER;
assert.equal(
  container,
  "supabase_db_rollcall_discussion_check",
  "Use the isolated discussion test stack, never an ordinary or hosted database",
);
const host = randomUUID(),
  actor = randomUUID(),
  event = randomUUID(),
  timed = randomUUID(),
  prefix = "discussion-" + randomUUID();
const children = new Set();
function connection(name) {
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  children.add(child);
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      children.delete(child);
      code === 0 ? resolve(stdout) : reject(Error(stderr));
    });
  });
  child.stdin.on("error", () => {});
  child.stdin.write(
    `set application_name='${prefix}-${name}'; set statement_timeout='15s';\n`,
  );
  return { child, done, output: () => stdout };
}
async function sql(text) {
  const c = connection("operator");
  c.child.stdin.end(text);
  return c.done;
}
async function waitFor(check, label) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(40);
  }
  throw Error("Timed out: " + label);
}
const call = (id, kind, input) =>
  `set role authenticated; select set_config('request.jwt.claims','{"sub":"${actor}","role":"authenticated"}',false); select public.event_discussion('${id}','${kind}','create','${JSON.stringify(input)}');`;
try {
  const helper = await readFile(
    new URL("./helpers/legacy-registration.inc", import.meta.url),
    "utf8",
  );
  await sql(`begin; ${helper}
 insert into auth.users(id,email,email_confirmed_at) values('${host}','race-host-${host}@example.test',now()),('${actor}','race-player-${actor}@example.test',now());
 drop trigger aaa_legacy_registration_fixture on auth.users; drop trigger zzz_legacy_registration_fixture on auth.users;
 insert into public.events(id,host_id,game_id,city_id,title,description,starts_at,ends_at,capacity,experience_level)
 values('${event}','${host}',1,(select id from public.cities limit 1),'Concurrent discussion','Synthetic event serialization fixture.',now()+interval '1 day',now()+interval '2 days',5,'all-levels');
 insert into private.event_locations(event_id,address) values('${event}','Synthetic race address'); commit;`);
  const canceller = connection("cancel");
  canceller.child.stdin.write(
    `begin; update public.events set status='cancelled' where id='${event}'; select 'LOCKED';\n`,
  );
  await waitFor(
    () => canceller.output().includes("LOCKED"),
    "cancellation row lock",
  );
  const writer = connection("writer");
  writer.child.stdin.end(
    call(event, "comments", { body: "Cannot race cancellation" }),
  );
  await waitFor(
    async () =>
      /t/.test(
        (
          await sql(
            `select exists(select 1 from pg_stat_activity where application_name='${prefix}-writer' and wait_event_type='Lock');`,
          )
        ).trim(),
      ),
    "comment waits on cancellation",
  );
  canceller.child.stdin.end("commit;");
  await canceller.done;
  assert.match(await writer.done, /"errorCode": "closed"/);
  assert.match(
    await sql(
      `select count(*) from private.event_comments where event_id='${event}';`,
    ),
    /0/,
  );
  console.log(
    "PASS: concurrent cancellation wins; waiting comment cannot insert",
  );
  // Real time progression: valid RSVP first, then hold the event lock past ends_at.
  await sql(`begin; insert into public.events(id,host_id,game_id,city_id,title,description,starts_at,ends_at,capacity,experience_level)
 values('${timed}','${host}',1,(select id from public.cities limit 1),'Timed discussion','Synthetic authoritative clock fixture.',clock_timestamp()+interval '2 seconds',clock_timestamp()+interval '4 seconds',5,'all-levels');
 insert into private.event_locations(event_id,address) values('${timed}','Synthetic time address');
 insert into public.event_participants(event_id,profile_id) values('${timed}','${actor}'); commit;`);
  const holder = connection("time-holder");
  holder.child.stdin.write(
    `begin; select id from public.events where id='${timed}' for update; select 'LOCKED';\n`,
  );
  await waitFor(() => holder.output().includes("LOCKED"), "timed row lock");
  const timedWriter = connection("timed-writer");
  timedWriter.child.stdin.end(
    call(timed, "comments", { body: "Transaction began before end" }),
  );
  await waitFor(
    async () =>
      /t/.test(
        (
          await sql(
            `select exists(select 1 from pg_stat_activity where application_name='${prefix}-timed-writer' and wait_event_type='Lock');`,
          )
        ).trim(),
      ),
    "timed writer waits",
  );
  await waitFor(
    async () =>
      /t/.test(
        (
          await sql(
            `select clock_timestamp()>=ends_at from public.events where id='${timed}';`,
          )
        ).trim(),
      ),
    "database event completion",
  );
  holder.child.stdin.end("commit;");
  await holder.done;
  assert.match(await timedWriter.done, /"errorCode": "closed"/);
  console.log("PASS: end time rechecked after lock wait, using database clock");
  const first = connection("review-one"),
    second = connection("review-two");
  first.child.stdin.end(
    call(timed, "reviews", { rating: 5, body: "First review" }),
  );
  second.child.stdin.end(
    call(timed, "reviews", { rating: 4, body: "Second review" }),
  );
  const outputs = await Promise.all([first.done, second.done]);
  assert.equal(
    outputs.filter((text) => text.includes('"errorCode": "duplicate"')).length,
    1,
  );
  assert.equal(
    outputs.filter((text) => text.includes('"viewerId":')).length,
    1,
  );
  assert.match(
    await sql(
      `select count(*) from private.event_reviews where event_id='${timed}';`,
    ),
    /1/,
  );
  console.log("PASS: concurrent reviews yield exactly one persisted review");
} finally {
  for (const child of children) child.kill();
  await sql(
    `delete from public.events where id in ('${event}','${timed}'); delete from auth.users where id in ('${host}','${actor}');`,
  );
}
