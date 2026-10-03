import path from "node:path";
import { fileURLToPath } from "node:url";
import { EnvError, loadEnv } from "./config/env.js";
import { EncryptionService } from "./crypto/encryption.js";
import { EnvKeyProvider } from "./crypto/key-provider.js";
import { createPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { purgeDeadSessions } from "./modules/auth/sessions.js";
import { buildApp } from "./app.js";

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

const app = await buildApp({ env, pool });

const result = await migrate(pool, migrationsDir);
app.log.info({ applied: result.applied, skipped: result.skipped }, "database migrations");

setInterval(() => void purgeDeadSessions(pool).catch(() => {}), 3_600_000).unref();

await app.listen({ port: env.PORT, host: env.HOST });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
