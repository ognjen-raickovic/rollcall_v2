import { readFile, readdir } from "node:fs/promises";
import {
  repository,
  frontendEnvironment,
  envFile,
} from "./application-config.mjs";
const mode = process.argv[2] ?? "production";
if (!["production", "development"].includes(mode))
  throw new Error("Choose production or development.");
const effective = await frontendEnvironment(mode),
  base = await envFile("frontend/.env"),
  local = await envFile("frontend/.env.local");
let projectHost = "invalid",
  legacyProjectMatches = null;
try {
  const url = new URL(effective.VITE_SUPABASE_URL);
  projectHost = url.hostname;
  const claims = JSON.parse(
    Buffer.from(
      (effective.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").split(".")[1] ?? "",
      "base64url",
    ).toString(),
  );
  if (claims.ref)
    legacyProjectMatches = claims.ref === url.hostname.split(".")[0];
} catch {
  /* Opaque publishable keys cannot prove project membership offline. */
}
let builtKeyMatches = null,
  builtProjectMatches = null;
try {
  const files = (
    await readdir(new URL("frontend/dist/assets/", repository))
  ).filter((file) => file.endsWith(".js"));
  const bundles = await Promise.all(
    files.map((file) =>
      readFile(new URL("frontend/dist/assets/" + file, repository), "utf8"),
    ),
  );
  builtKeyMatches =
    Boolean(effective.VITE_SUPABASE_PUBLISHABLE_KEY) &&
    bundles.some((source) =>
      source.includes(effective.VITE_SUPABASE_PUBLISHABLE_KEY),
    );
  builtProjectMatches =
    Boolean(effective.VITE_SUPABASE_URL) &&
    bundles.some((source) => source.includes(effective.VITE_SUPABASE_URL));
} catch {
  /* No production build yet. */
}
console.log(
  JSON.stringify(
    {
      mode,
      projectHost,
      keyFormatValid: /^sb_publishable_[A-Za-z0-9_-]+$/.test(
        effective.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
      ),
      legacyProjectMatches,
      opaqueKeyProjectVerified: false,
      shellOverridesPublicKey: Object.hasOwn(
        process.env,
        "VITE_SUPABASE_PUBLISHABLE_KEY",
      ),
      localFileOverridesBaseKey: Boolean(
        local.VITE_SUPABASE_PUBLISHABLE_KEY &&
        local.VITE_SUPABASE_PUBLISHABLE_KEY !==
          base.VITE_SUPABASE_PUBLISHABLE_KEY,
      ),
      builtKeyMatches,
      builtProjectMatches,
    },
    null,
    2,
  ),
);
console.log(
  "No key values or hashes printed; no network requests made. Copy the key from the same project Dashboard, rebuild, stop/restart preview and hard-refresh. An opaque key prefix cannot establish server validity.",
);
