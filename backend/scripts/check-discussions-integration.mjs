// Reads only CLI-generated disposable LOCAL configuration, never ordinary env/operator files.
import { readFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const dir = "backend/.tmp/discussion-supabase";
const config = await readFile(dir + "/supabase/config.toml", "utf8");
if (
  !config.includes('project_id = "rollcall_discussion_check"') ||
  !config.includes("port = 61322")
)
  throw Error("Expected disposable discussion project");
const raw = execFileSync(
  "cmd.exe",
  [
    "/d",
    "/c",
    "node_modules\\.bin\\supabase.cmd",
    "status",
    "--workdir",
    dir,
    "--output",
    "json",
  ],
  { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
const status = JSON.parse(raw),
  url = new URL(status.DB_URL);
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "61322" ||
  status.API_URL !== "http://127.0.0.1:61321"
)
  throw Error("Refusing non-disposable endpoints");
const operation = randomBytes(32).toString("base64url");
const r = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "tests/integration/discussions.test.ts"],
  {
    cwd: "backend",
    encoding: "utf8",
    windowsHide: true,
    timeout: 100000,
    env: {
      ...process.env,
      NODE_ENV: "test",
      SUPABASE_URL: status.API_URL,
      SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
      EVENT_COVER_OPERATION_KEY: operation,
      DISCUSSION_TEST_DATABASE_URL: url.href,
      RUN_DISCUSSION_INTEGRATION: "true",
    },
  },
);
let output = (r.stdout ?? "") + (r.stderr ?? "");
for (const secret of [status.ANON_KEY, url.href, operation])
  output = output.replaceAll(secret, "[redacted]");
console.log(
  output
    .split(/\r?\n/)
    .filter(
      (line) => !/(?:eyJ[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/)/.test(line),
    )
    .join("\n"),
);
process.exitCode = r.status ?? 1;
