import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

export const repository = new URL("../", import.meta.url);
export async function envFile(relative, required = false) {
  try {
    return parseEnv(await readFile(new URL(relative, repository), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && !required) return {};
    throw new Error(
      `Configure ${relative} from its example; private values are never printed.`,
    );
  }
}
export function validateProject(urlValue, key, mode, expectedRef) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("Set a valid Supabase project origin.");
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use only the Supabase project origin, without credentials or a path.",
    );
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    mode === "local" &&
    (!local || !["http:", "https:"].includes(url.protocol))
  )
    throw new Error(
      "dev:all requires local Supabase in the ordinary env files. Use staging:smoke for hosted testing.",
    );
  if (
    mode === "staging" &&
    (url.protocol !== "https:" ||
      !/^[a-z0-9]{20}$/.test(expectedRef ?? "") ||
      url.hostname !== `${expectedRef}.supabase.co`)
  )
    throw new Error(
      "Staging URL must match the explicit public SUPABASE_PROJECT_REF.",
    );
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? ""))
    return {
      origin: url.origin,
      keyKind: "publishable",
      opaqueKeyProjectVerified: false,
    };
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString(),
    );
    if (
      payload.role !== "anon" ||
      (!local && payload.ref !== url.hostname.split(".")[0])
    )
      throw new Error();
    return {
      origin: url.origin,
      keyKind: "legacy-anon",
      opaqueKeyProjectVerified: false,
    };
  } catch {
    throw new Error(
      "Use a correctly formatted publishable key or matching legacy anon key. Never use a secret/service-role key.",
    );
  }
}
const runtime = [
  "EVENT_COVER_OPERATION_KEY",
  "EVENT_INVITATION_KEY",
  "SUPABASE_TIMEOUT_MS",
  "CITY_SEARCH_DEFAULT_LIMIT",
  "CITY_SEARCH_MAX_LIMIT",
];
export function stagingConfig(values) {
  const allowed = new Set([
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PROJECT_REF",
    "FRONTEND_PORT",
    "BACKEND_PORT",
    ...runtime,
  ]);
  if (Object.keys(values).some((name) => !allowed.has(name)))
    throw new Error(
      "Staging app configuration contains an unsupported field. Do not copy an operator env file.",
    );
  validateProject(
    values.SUPABASE_URL,
    values.SUPABASE_PUBLISHABLE_KEY,
    "staging",
    values.SUPABASE_PROJECT_REF,
  );
  return values;
}
export async function verifyPublicKey(values, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(
      new URL("/auth/v1/settings", values.SUPABASE_URL),
      {
        headers: { apikey: values.SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      },
    );
  } catch {
    throw new Error(
      "Could not verify the staging public key through the read-only Auth settings endpoint. Check connectivity; no signup was attempted.",
    );
  }
  if (!response.ok)
    throw new Error(
      `Staging Auth public-key check returned HTTP ${response.status}. Verify the project/key pairing in the Dashboard; no signup was attempted.`,
    );
}
export async function frontendEnvironment(
  mode = "production",
  shell = process.env,
) {
  let env = {};
  for (const file of [
    ".env",
    ".env.local",
    `.env.${mode}`,
    `.env.${mode}.local`,
  ])
    env = { ...env, ...(await envFile("frontend/" + file)) };
  return { ...env, ...shell };
}
export function childEnvironments(values, frontPort, backPort) {
  const operatingSystem = Object.fromEntries(
    [
      "PATH",
      "SystemRoot",
      "WINDIR",
      "USERPROFILE",
      "HOMEDRIVE",
      "HOMEPATH",
      "TEMP",
      "TMP",
      "APPDATA",
      "LOCALAPPDATA",
      "HOME",
      "LANG",
    ]
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]]),
  );
  const backend = {
    ...operatingSystem,
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: String(backPort),
    LOG_LEVEL: "info",
    SUPABASE_URL: values.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: values.SUPABASE_PUBLISHABLE_KEY,
  };
  for (const name of runtime) if (values[name]) backend[name] = values[name];
  const frontend = {
    ...operatingSystem,
    NODE_ENV: "development",
    VITE_SUPABASE_URL: values.SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: values.SUPABASE_PUBLISHABLE_KEY,
    VITE_API_ORIGIN: "",
    VITE_ENABLE_DEMO_MODE: "false",
    API_PROXY_TARGET: `http://127.0.0.1:${backPort}`,
  };
  return { backend, frontend, frontPort };
}
