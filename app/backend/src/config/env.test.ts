import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { EnvError, loadEnv } from "./env.js";

const key = () => randomBytes(32).toString("base64");
const base = () => ({
  NODE_ENV: "production",
  DATABASE_URL: "postgres://private_vault_user:pw@private-vault-db:5432/private_vault",
  APP_SECRET: randomBytes(32).toString("hex"),
  SESSION_SECRET: randomBytes(32).toString("hex"),
  ENCRYPTION_KEY: key(),
  TOTP_ENCRYPTION_KEY: key(),
  APP_ORIGIN: "https://vault.example.ts.net",
  SETUP_TOKEN: randomBytes(24).toString("hex"),
});

test("accepts a complete production configuration", () => {
  const env = loadEnv(base());
  assert.equal(env.SESSION_IDLE_MINUTES, 15);
  assert.equal(env.ALLOW_CVV_STORAGE, false);
});

test("refuses to start when a required secret is missing", () => {
  const { ENCRYPTION_KEY: _drop, ...rest } = base();
  void _drop;
  assert.throws(
    () => loadEnv(rest),
    (e) => e instanceof EnvError && e.message.includes("ENCRYPTION_KEY"),
  );
});

test("refuses placeholder values copied from .env.example", () => {
  assert.throws(
    () => loadEnv({ ...base(), SESSION_SECRET: "change-me-change-me-change-me-change-me" }),
    /placeholder/,
  );
});

test("refuses reused keys in production", () => {
  const k = key();
  assert.throws(
    () => loadEnv({ ...base(), ENCRYPTION_KEY: k, TOTP_ENCRYPTION_KEY: k }),
    /must differ/,
  );
});

test("refuses insecure cookies in production", () => {
  assert.throws(() => loadEnv({ ...base(), COOKIE_SECURE: "false" }), /COOKIE_SECURE/);
});

test("never echoes secret values in the error", () => {
  const bad = "short-but-secret-value";
  try {
    loadEnv({ ...base(), APP_SECRET: bad });
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof EnvError);
    assert.equal(e.message.includes(bad), false);
  }
});

test("treats an empty optional key (as written by docker compose) as unset", () => {
  assert.equal(
    loadEnv({ ...base(), ENCRYPTION_KEY_PREVIOUS: "" }).ENCRYPTION_KEY_PREVIOUS,
    undefined,
  );
});

test("production refuses to start without SETUP_TOKEN", () => {
  const { SETUP_TOKEN: _drop, ...rest } = base();
  void _drop;
  assert.throws(
    () => loadEnv(rest),
    (e) => e instanceof EnvError && e.message.includes("SETUP_TOKEN"),
  );
});
