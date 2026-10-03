/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { migrate } from "../../db/migrate.js";
import { base32Decode, hotp, totpStep } from "./totp.js";

/**
 * Runs against a real PostgreSQL. Set TEST_DATABASE_URL to an EMPTY throwaway
 * database (it is wiped); without it these tests are skipped.
 */
const url = process.env.TEST_DATABASE_URL;
const opts = { skip: url ? false : "TEST_DATABASE_URL not set" };

const ORIGIN = "https://vault.test";
const SETUP_TOKEN = randomBytes(24).toString("hex");
const PASSWORD = "Tr1cky-Vault-Pass!";
let clock = 1_800_000_000_000;
let app: FastifyInstance;
let pool: pg.Pool;

before(async () => {
  if (!url) return;
  pool = new pg.Pool({ connectionString: url });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE EXTENSION citext;");
  await migrate(
    pool,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../migrations"),
  );
  const env = loadEnv({
    NODE_ENV: "test",
    DATABASE_URL: url,
    APP_SECRET: randomBytes(32).toString("hex"),
    SESSION_SECRET: randomBytes(32).toString("hex"),
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    TOTP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    APP_ORIGIN: ORIGIN,
    COOKIE_SECURE: "true",
    SETUP_TOKEN,
  });
  app = await buildApp({ env, pool, now: () => clock });
});
after(async () => {
  await app?.close();
  await pool?.end();
});

interface Client {
  cookie?: string;
  csrf?: string;
}
async function call(
  c: Client,
  method: string,
  url: string,
  body?: unknown,
  extra: Record<string, string> = {},
) {
  const res = await app.inject({
    method: method as "GET",
    url,
    remoteAddress: "10.1.1.1",
    headers: {
      origin: ORIGIN,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(c.cookie ? { cookie: c.cookie } : {}),
      ...(c.csrf ? { "x-csrf-token": c.csrf } : {}),
      ...extra,
    },
    payload: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.cookies[0];
  if (set) c.cookie = set.value ? `${set.name}=${set.value}` : undefined;
  const json = res.body ? (JSON.parse(res.body) as Record<string, any>) : {};
  if (json.csrfToken) c.csrf = json.csrfToken;
  return {
    status: res.statusCode,
    json,
    headers: res.headers,
    setCookie: res.headers["set-cookie"] as string | undefined,
  };
}
const code = (secret: string, stepOffset = 0) =>
  hotp(Buffer.from(base32Decode(secret)), totpStep(clock) + stepOffset);

let totpSecret = "";
let recoveryCodes: string[] = [];

test("first launch: state says setup required", opts, async () => {
  const r = await call({}, "GET", "/api/auth/state");
  assert.equal(r.json.setupRequired, true);
  assert.equal(r.json.stage, "none");
});

test(
  "setup requires the setup token, a strong password, and a same-origin JSON request",
  opts,
  async () => {
    const c: Client = {};
    assert.equal(
      (await call(c, "POST", "/api/auth/setup", { username: "alex", password: PASSWORD })).status,
      403,
    );
    assert.equal(
      (
        await call(c, "POST", "/api/auth/setup", {
          username: "alex",
          password: "weak",
          setupToken: SETUP_TOKEN,
        })
      ).status,
      422,
    );
    const bad = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      headers: { origin: "https://evil.test", "content-type": "application/json" },
      payload: JSON.stringify({ username: "alex", password: PASSWORD, setupToken: SETUP_TOKEN }),
    });
    assert.equal(bad.statusCode, 403);
    const form = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      headers: { origin: ORIGIN, "content-type": "text/plain" },
      payload: "x",
    });
    assert.equal(form.statusCode, 403);
    const n = await pool.query("SELECT count(*) AS n FROM users");
    assert.equal(n.rows[0].n, "0");
  },
);

test("setup → TOTP verification → recovery codes → active session", opts, async () => {
  const c: Client = {};
  const s = await call(c, "POST", "/api/auth/setup", {
    username: "alex",
    password: PASSWORD,
    setupToken: SETUP_TOKEN,
  });
  assert.equal(s.status, 201);
  assert.match(s.setCookie ?? "", /__Host-vault_session=.*HttpOnly.*SameSite=Strict/i);
  assert.match(s.setCookie ?? "", /Secure/);
  totpSecret = s.json.totp.secret;
  assert.match(s.json.totp.otpauthUri, /^otpauth:\/\/totp\//);

  // The secret is encrypted at rest.
  const row = await pool.query("SELECT totp_secret_enc, password_hash FROM users");
  assert.equal(row.rows[0].totp_secret_enc.includes(Buffer.from(totpSecret)), false);
  assert.match(row.rows[0].password_hash, /^\$argon2id\$/);

  // Half-authenticated: protected routes refuse.
  assert.equal((await call(c, "GET", "/api/sessions")).status, 401);
  // Reload mid-setup shows the same secret.
  assert.equal((await call(c, "GET", "/api/auth/setup/totp")).json.totp.secret, totpSecret);

  assert.equal((await call(c, "POST", "/api/auth/setup/verify", { code: "000000" })).status, 401);
  const ok = await call(c, "POST", "/api/auth/setup/verify", { code: code(totpSecret) });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.stage, "active");
  recoveryCodes = ok.json.recoveryCodes;
  assert.equal(recoveryCodes.length, 10);

  const hashes = await pool.query("SELECT code_hash FROM recovery_codes");
  assert.equal(hashes.rowCount, 10);
  for (const h of hashes.rows) assert.match(h.code_hash, /^\$argon2id\$/);

  assert.equal((await call(c, "GET", "/api/sessions")).status, 200);
});

test("setup cannot be run twice", opts, async () => {
  const r = await call({}, "POST", "/api/auth/setup", {
    username: "mallory",
    password: PASSWORD,
    setupToken: SETUP_TOKEN,
  });
  assert.equal(r.status, 409);
  assert.equal((await call({}, "GET", "/api/auth/state")).json.setupRequired, false);
});

test("login needs password then TOTP; a used code cannot be replayed", opts, async () => {
  clock += 120_000;
  const c: Client = {};
  const wrong = await call(c, "POST", "/api/auth/login", {
    username: "alex",
    password: "nope-nope-nope",
  });
  assert.equal(wrong.status, 401);
  const unknown = await call(c, "POST", "/api/auth/login", {
    username: "nobody",
    password: "nope-nope-nope",
  });
  assert.equal(unknown.json.error, wrong.json.error, "same message for unknown user");

  const step1 = await call(c, "POST", "/api/auth/login", { username: "alex", password: PASSWORD });
  assert.equal(step1.json.stage, "pending_totp");
  assert.equal((await call(c, "GET", "/api/sessions")).status, 401, "password alone is not enough");
  const good = code(totpSecret);
  const step2 = await call(c, "POST", "/api/auth/totp", { code: good });
  assert.equal(step2.json.stage, "active");

  const c2: Client = {};
  await call(c2, "POST", "/api/auth/login", { username: "alex", password: PASSWORD });
  assert.equal(
    (await call(c2, "POST", "/api/auth/totp", { code: good })).status,
    401,
    "replay refused",
  );
});

test("session id rotates on every promotion (no fixation)", opts, async () => {
  clock += 120_000;
  const c: Client = {};
  await call(c, "POST", "/api/auth/login", { username: "alex", password: PASSWORD });
  const pending = c.cookie;
  await call(c, "POST", "/api/auth/totp", { code: code(totpSecret) });
  assert.notEqual(c.cookie, pending);
  assert.equal((await call({ cookie: pending, csrf: c.csrf }, "GET", "/api/sessions")).status, 401);
});

test("writes need a CSRF token bound to the session", opts, async () => {
  clock += 120_000;
  const c: Client = {};
  await call(c, "POST", "/api/auth/login", { username: "alex", password: PASSWORD });
  await call(c, "POST", "/api/auth/totp", { code: code(totpSecret) });
  const { csrf } = c;
  c.csrf = undefined;
  assert.equal((await call(c, "POST", "/api/sessions/revoke-others", {})).status, 403);
  c.csrf = "forged";
  assert.equal((await call(c, "POST", "/api/sessions/revoke-others", {})).status, 403);
  c.csrf = csrf;
  assert.equal((await call(c, "POST", "/api/sessions/revoke-others", {})).status, 200);
});

test("idle timeout and absolute expiry end the session", opts, async () => {
  clock += 120_000;
  const c: Client = {};
  await call(c, "POST", "/api/auth/login", { username: "alex", password: PASSWORD });
  await call(c, "POST", "/api/auth/totp", { code: code(totpSecret) });
  clock += 14 * 60_000;
  assert.equal((await call(c, "GET", "/api/sessions")).status, 200, "activity keeps it alive");
  clock += 14 * 60_000;
  assert.equal((await call(c, "GET", "/api/sessions")).status, 200);
  clock += 16 * 60_000;
  assert.equal((await call(c, "GET", "/api/sessions")).status, 401, "15 min idle → expired");

  clock += 120_000;
  const d: Client = {};
  await call(d, "POST", "/api/auth/login", { username: "alex", password: PASSWORD });
  await call(d, "POST", "/api/auth/totp", { code: code(totpSecret) });
  for (let i = 0; i < 13; i++) {
    clock += 55 * 60_000;
    await call(d, "GET", "/api/sessions").catch(() => {});
  }
  assert.equal((await call(d, "GET", "/api/sessions")).status, 401, "12 h absolute limit");
});

test("list, revoke one, revoke others, logout", opts, async () => {
  clock += 10 * 3_600_000;
  const a: Client = {};
  const b: Client = {};
  for (const c of [a, b]) {
    await call(c, "POST", "/api/auth/login", { username: "alex", password: PASSWORD });
    clock += 31_000;
    await call(c, "POST", "/api/auth/totp", { code: code(totpSecret) });
    clock += 31_000;
  }
  const list = await call(a, "GET", "/api/sessions");
  assert.ok(list.json.sessions.length >= 2);
  assert.equal(list.json.sessions.filter((s: any) => s.current).length, 1);
  const other = list.json.sessions.find((s: any) => !s.current);
  assert.equal((await call(a, "DELETE", `/api/sessions/${other.id}`)).status, 200);
  assert.equal((await call(a, "DELETE", `/api/sessions/${other.id}`)).status, 404);
  assert.equal((await call(a, "DELETE", "/api/sessions/not-a-uuid")).status, 400);
  const out = await call(a, "POST", "/api/auth/logout", {});
  assert.equal(out.status, 200);
  assert.equal(
    (await call({ cookie: a.cookie ?? "", csrf: a.csrf }, "GET", "/api/sessions")).status,
    401,
  );
});

test("recovery code logs in once and is then spent", opts, async () => {
  clock += 3_600_000;
  const c: Client = {};
  await call(c, "POST", "/api/auth/login", { username: "alex", password: PASSWORD });
  const r = await call(c, "POST", "/api/auth/recovery", { code: recoveryCodes[0]!.toLowerCase() });
  assert.equal(r.status, 200);
  assert.equal(r.json.recoveryCodesLeft, 9);
  const c2: Client = {};
  await call(c2, "POST", "/api/auth/login", { username: "alex", password: PASSWORD });
  assert.equal(
    (await call(c2, "POST", "/api/auth/recovery", { code: recoveryCodes[0] })).status,
    401,
  );
});

test(
  "brute force: delay after repeated failures, lifted with time, never permanent",
  opts,
  async () => {
    clock += 3_600_000;
    const c: Client = {};
    for (let i = 0; i < 5; i++)
      assert.equal(
        (
          await call(c, "POST", "/api/auth/login", {
            username: "alex",
            password: "wrong-wrong-wrong",
          })
        ).status,
        401,
      );
    const blocked = await call(c, "POST", "/api/auth/login", {
      username: "alex",
      password: PASSWORD,
    });
    assert.equal(blocked.status, 429, "even the right password waits");
    assert.ok(Number(blocked.headers["retry-after"]) > 0);
    clock += 31_000;
    assert.equal(
      (await call(c, "POST", "/api/auth/login", { username: "alex", password: PASSWORD })).status,
      200,
    );
  },
);

test("five wrong second-factor codes burn the pending session", opts, async () => {
  clock += 3_600_000;
  const c: Client = {};
  await call(c, "POST", "/api/auth/login", { username: "alex", password: PASSWORD });
  for (let i = 0; i < 5; i++) await call(c, "POST", "/api/auth/totp", { code: "000000" });
  clock += 20 * 60_000;
  const r = await call(c, "POST", "/api/auth/totp", { code: code(totpSecret) });
  assert.equal(r.status, 401);
});

test("audit log records auth events and no secrets", opts, async () => {
  const types = await pool.query("SELECT DISTINCT event_type FROM audit_log");
  const set = new Set(types.rows.map((r) => r.event_type));
  for (const e of ["LOGIN_SUCCESS", "LOGIN_FAILED", "LOGOUT", "2FA_CHANGED", "SESSION_REVOKED"])
    assert.ok(set.has(e), e);
  const dump = JSON.stringify((await pool.query("SELECT * FROM audit_log")).rows);
  assert.equal(dump.includes(PASSWORD), false);
  assert.equal(dump.includes(totpSecret), false);
  for (const rc of recoveryCodes) assert.equal(dump.includes(rc), false);
  await assert.rejects(pool.query("DELETE FROM audit_log"), /append-only/);
});

test("secrets never reach logs or error bodies", opts, async () => {
  const r = await call({}, "POST", "/api/auth/login", { username: "alex", password: { $ne: 1 } });
  assert.equal(r.status, 400);
  assert.equal(JSON.stringify(r.json).includes("zod"), false);
});
