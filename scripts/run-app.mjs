import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  repository,
  envFile,
  stagingConfig,
  frontendEnvironment,
  validateProject,
  childEnvironments,
  verifyPublicKey,
} from "./application-config.mjs";

export async function assertPortFree(port, host, label) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error(`${label} port must be an integer from 1024 to 65535.`);
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", () =>
      reject(
        new Error(
          `${label} port ${port} is unavailable. Stop the existing process or choose a different app port.`,
        ),
      ),
    );
    probe.listen(port, host, () => probe.close(resolve));
  });
}
export async function stopProcessTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        {
          windowsHide: true,
          stdio: "ignore",
        },
      );
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}
async function main() {
  const mode = process.argv[2];
  if (!["local", "staging"].includes(mode))
    throw new Error("Use pnpm dev:all or pnpm staging:smoke.");
  let values;
  if (mode === "staging")
    values = stagingConfig(await envFile(".env.staging-app", true));
  else {
    const backend = { ...(await envFile("backend/.env")), ...process.env },
      front = await frontendEnvironment("development");
    validateProject(
      backend.SUPABASE_URL,
      backend.SUPABASE_PUBLISHABLE_KEY,
      "local",
    );
    validateProject(
      front.VITE_SUPABASE_URL,
      front.VITE_SUPABASE_PUBLISHABLE_KEY,
      "local",
    );
    if (
      new URL(backend.SUPABASE_URL).origin !==
        new URL(front.VITE_SUPABASE_URL).origin ||
      backend.SUPABASE_PUBLISHABLE_KEY !== front.VITE_SUPABASE_PUBLISHABLE_KEY
    )
      throw new Error(
        "Frontend/backend public configuration differs. Configure the same local project/key; no values were printed.",
      );
    values = backend;
  }
  const frontPort = Number(values.FRONTEND_PORT ?? 5173),
    backPort = Number(values.BACKEND_PORT ?? values.PORT ?? 3001);
  if (frontPort === backPort)
    throw new Error("Frontend/backend ports must differ.");
  await assertPortFree(frontPort, "localhost", "Frontend");
  await assertPortFree(backPort, "127.0.0.1", "Backend");
  if (mode === "staging") await verifyPublicKey(values);
  return startServices(values, frontPort, backPort, mode);
}
export function startServices(values, frontPort, backPort, mode = "staging") {
  const env = childEnvironments(values, frontPort, backPort),
    children = [];
  let stopping = false;
  const stop = async (code) => {
    if (stopping) return;
    stopping = true;
    await Promise.all(children.map(stopProcessTree));
    process.exitCode = code;
  };
  for (const [label, args, folder] of [
    ["backend", ["--watch", "--import", "tsx", "src/server.ts"], "backend/"],
    [
      "frontend",
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "localhost",
        "--port",
        String(frontPort),
        "--strictPort",
      ],
      "frontend/",
    ],
  ]) {
    const child = spawn(process.execPath, args, {
      cwd: fileURLToPath(new URL(folder, repository)),
      env: env[label],
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    for (const stream of [child.stdout, child.stderr])
      createInterface({ input: stream }).on("line", (line) => {
        for (const secret of [
          values.EVENT_COVER_OPERATION_KEY,
          values.EVENT_INVITATION_KEY,
        ])
          if (secret) line = line.replaceAll(secret, "[redacted]");
        console.log(`[${label}] ${line}`);
      });
    child.once("error", () => {
      console.error(
        `[${label}] Could not start the process. Run pnpm install and check Node.js.`,
      );
      void stop(1);
    });
    child.once("exit", (code) => {
      if (!stopping) {
        console.error(`[${label}] Process exited; stopping both services.`);
        void stop(code || 1);
      }
    });
  }
  process.once("SIGINT", () => void stop(0));
  process.once("SIGTERM", () => void stop(0));
  console.log(
    `RollCall ${mode}: http://localhost:${frontPort}; API on loopback port ${backPort}. Ctrl+C stops both processes.`,
  );
  if (mode === "staging")
    console.log(
      "Uses dedicated app configuration only; no operator files, migrations, Docker startup or automatic accounts. Registration requires migration 17 and the existing backend operation key.",
    );
  return { stop, children };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
