import { z } from "zod";

/**
 * Startup configuration. Parsed once; the process refuses to start when a
 * required secret is missing, too short, or still a placeholder from
 * .env.example. Secrets are never logged: only the variable NAMES appear in
 * error output.
 */

const PLACEHOLDER = /change[-_]?me|example|placeholder|xxxx/i;

/** 32 random bytes, base64-encoded (what scripts/generate-secrets.sh emits). */
const key32 = z
  .string()
  .refine((v) => !PLACEHOLDER.test(v), "still contains a placeholder value")
  .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded");

const secret = z
  .string()
  .min(32, "must be at least 32 characters")
  .refine((v) => !PLACEHOLDER.test(v), "still contains a placeholder value");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith("postgres"), "must be a postgres:// URL"),

  APP_SECRET: secret,
  SESSION_SECRET: secret,
  ENCRYPTION_KEY: key32,
  /** Previous key, kept only while records are being re-encrypted after a rotation. */
  ENCRYPTION_KEY_PREVIOUS: z.preprocess((v) => (v === "" ? undefined : v), key32.optional()),
  ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).max(65535).default(1),
  TOTP_ENCRYPTION_KEY: key32,

  /** Exact origin of the UI, e.g. https://vault.example.ts.net. Writes from any other Origin are rejected. */
  APP_ORIGIN: z.string().url(),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(240).default(15),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  TRASH_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  UPLOADS_DIR: z.string().default("/opt/private-vault/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(20),

  /** CVV storage is off unless explicitly enabled. Never enable it casually. */
  ALLOW_CVV_STORAGE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join("\n  - ")}`);
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new EnvError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  const env = parsed.data;
  const problems: string[] = [];
  if (env.NODE_ENV === "production") {
    if (!env.COOKIE_SECURE) problems.push("COOKIE_SECURE: must be true in production");
    const keys = [env.ENCRYPTION_KEY, env.TOTP_ENCRYPTION_KEY];
    if (new Set(keys).size !== keys.length)
      problems.push("TOTP_ENCRYPTION_KEY: must differ from ENCRYPTION_KEY");
    if (env.APP_SECRET === env.SESSION_SECRET)
      problems.push("SESSION_SECRET: must differ from APP_SECRET");
  }
  if (problems.length) throw new EnvError(problems);
  return env;
}
