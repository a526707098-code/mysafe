import { access, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { EnvError, loadEnv } from "./config/env.js";
import { EncryptionService } from "./crypto/encryption.js";
import { EnvKeyProvider } from "./crypto/key-provider.js";
import { createPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";

let env;
try {
  env = loadEnv();
} catch (e) {
  // Names only, never values (EnvError guarantees that).
  process.stderr.write(
    `${e instanceof EnvError ? e.message : "invalid configuration"}\nRefusing to start.\n`,
  );
  process.exit(1);
}

// Constructing the service validates the keys at boot rather than on first use.
export const encryption = new EncryptionService(
  new EnvKeyProvider(env.ENCRYPTION_KEY_VERSION, env.ENCRYPTION_KEY, env.ENCRYPTION_KEY_PREVIOUS),
);

const pool = createPool(env.DATABASE_URL);
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

const app = Fastify({
  trustProxy: "127.0.0.1/8,172.16.0.0/12,10.0.0.0/8", // Nginx on the private Docker network
  bodyLimit: 64 * 1024,
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    // Defence in depth: even if a handler logs a request object, these never reach the log.
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        "req.headers['x-csrf-token']",
        "res.headers['set-cookie']",
        "*.password",
        "*.secret",
        "*.totp",
        "*.code",
        "*.number",
        "*.value",
      ],
      censor: "[redacted]",
    },
  },
});

// Never leak internals: production clients get a generic message and a request id.
app.setErrorHandler((err, req, reply) => {
  req.log.error({ err }, "request failed");
  const e = err as { statusCode?: number; message?: string };
  const status = e.statusCode ?? 500;
  const safe = status < 500 && env.NODE_ENV !== "production" ? e.message : undefined;
  void reply
    .status(status)
    .send({ error: safe ?? (status < 500 ? "בקשה לא תקינה" : "אירעה שגיאה"), requestId: req.id });
});

app.addHook("onSend", async (_req, reply) => {
  reply.header("Cache-Control", "no-store");
  reply.header("X-Content-Type-Options", "nosniff");
});

/**
 * Health. Nginx returns 404 for /api/health from outside, so this is reachable
 * only on the Docker network (healthchecks, monitoring). Even so it reports
 * pass/fail per check, never versions, paths or error text.
 */
app.get("/api/health", async (_req, reply) => {
  const checks: Record<string, "ok" | "fail"> = { app: "ok", database: "fail", storage: "fail" };
  try {
    await pool.query("SELECT 1");
    checks.database = "ok";
  } catch {
    /* reported as fail */
  }
  try {
    await access(env.UPLOADS_DIR, constants.R_OK | constants.W_OK);
    checks.storage = "ok";
  } catch {
    /* reported as fail */
  }
  const healthy = Object.values(checks).every((v) => v === "ok");
  return reply.status(healthy ? 200 : 503).send({ status: healthy ? "ok" : "degraded", checks });
});

const result = await migrate(pool, migrationsDir);
app.log.info({ applied: result.applied, skipped: result.skipped }, "database migrations");

await app.listen({ port: env.PORT, host: env.HOST });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
