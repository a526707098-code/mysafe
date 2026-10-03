import { access, constants } from "node:fs/promises";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import type { Env } from "./config/env.js";
import { EncryptionService } from "./crypto/encryption.js";
import { EnvKeyProvider } from "./crypto/key-provider.js";
import type { Pool } from "./db/pool.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";

export interface AppDeps {
  env: Env;
  pool: Pool;
  /** Test hook: fixed clock. */
  now?: () => number;
}

export async function buildApp({ env, pool, now }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: "127.0.0.1/8,172.16.0.0/12,10.0.0.0/8", // Nginx on the private Docker network
    bodyLimit: 64 * 1024,
    logger:
      env.NODE_ENV === "test"
        ? false
        : {
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
                "*.setupToken",
                "*.number",
                "*.value",
              ],
              censor: "[redacted]",
            },
          },
  });

  await app.register(cookie);

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

  registerAuthRoutes(app, {
    env,
    pool,
    now,
    totpCrypto: new EncryptionService(new EnvKeyProvider(1, env.TOTP_ENCRYPTION_KEY)),
  });

  return app;
}
