import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { encryptionContext, type EncryptionService } from "../../crypto/encryption.js";
import { audit } from "./audit.js";
import {
  checkPasswordPolicy,
  dummyHash,
  generateRecoveryCodes,
  hashPassword,
  normalizeRecoveryCode,
  verifyPassword,
} from "./passwords.js";
import { recordAttempt, retryAfterMs, type AttemptStage } from "./rate-limit.js";
import {
  createSession,
  csrfFor,
  csrfMatches,
  findSession,
  listActive,
  revokeAllForUser,
  revokeSession,
  type SessionConfig,
  type SessionRow,
} from "./sessions.js";
import { generateTotpSecret, otpauthUri, verifyTotp } from "./totp.js";

export interface AuthDeps {
  env: Env;
  pool: Pool;
  /** Encrypts TOTP secrets only (TOTP_ENCRYPTION_KEY), separate from vault data. */
  totpCrypto: EncryptionService;
  now?: () => number;
}

declare module "fastify" {
  interface FastifyRequest {
    session?: SessionRow;
  }
}

const MSG = {
  badCreds: "שם משתמש או סיסמה שגויים",
  badCode: "הקוד שגוי או שפג תוקפו",
  csrf: "הבקשה נדחתה",
  auth: "נדרשת התחברות",
  throttled: "יותר מדי ניסיונות. נסו שוב בעוד זמן קצר",
  setupDone: "ההגדרה הראשונית כבר הושלמה",
};

const username = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[\p{L}\p{N}._-]+$/u, "invalid characters");

const loginBody = z.object({ username, password: z.string().min(1).max(256) }).strict();
const setupBody = z
  .object({
    username,
    password: z.string().min(1).max(256),
    setupToken: z.string().max(256).optional(),
  })
  .strict();
const codeBody = z.object({ code: z.string().trim().min(6).max(16) }).strict();

const sha = (s: string) => createHash("sha256").update(s).digest();
const safeEq = (a: string, b: string) => {
  const x = sha(a);
  const y = sha(b);
  return timingSafeEqual(x, y);
};

/** Only called behind requireStage(), which guarantees a session. */
export const cur = (req: FastifyRequest) => req.session as SessionRow;

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps) {
  const { env, pool, totpCrypto } = deps;
  const now = () => (deps.now ? deps.now() : Date.now());
  const cfg: SessionConfig = {
    sessionSecret: env.SESSION_SECRET,
    idleMs: env.SESSION_IDLE_MINUTES * 60_000,
    absoluteMs: env.SESSION_ABSOLUTE_HOURS * 3_600_000,
    pendingMs: 10 * 60_000,
  };
  const cookieName = env.COOKIE_SECURE ? "__Host-vault_session" : "vault_session";
  const cookieOpts = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "strict" as const,
    path: "/",
  };

  const setCookie = (reply: FastifyReply, token: string, expiresAt: Date) =>
    reply.setCookie(cookieName, token, { ...cookieOpts, expires: expiresAt });
  const clearCookie = (reply: FastifyReply) => reply.clearCookie(cookieName, cookieOpts);

  const meta = (req: FastifyRequest) => ({
    ip: req.ip,
    userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
  });

  /** Origin + content-type on every write; CSRF token on every write that has a session. */
  app.addHook("preHandler", async (req, reply) => {
    if (!req.url.startsWith("/api/") || req.url.startsWith("/api/health")) return;
    req.session = (await findSession(pool, cfg, req.cookies[cookieName], now())) ?? undefined;
    if (req.method === "GET" || req.method === "HEAD") return;
    const ct = (req.headers["content-type"] ?? "").split(";")[0]?.trim();
    const hasBody =
      req.headers["content-length"] !== undefined && req.headers["content-length"] !== "0";
    const originOk = req.headers.origin === env.APP_ORIGIN;
    const ctOk = ct === "application/json" || (!hasBody && !ct);
    if (!originOk || !ctOk) return reply.status(403).send({ error: MSG.csrf });
    if (
      req.session &&
      !csrfMatches(env.SESSION_SECRET, req.session.id, req.headers["x-csrf-token"])
    )
      return reply.status(403).send({ error: MSG.csrf });
  });

  const requireStage =
    (stage: SessionRow["stage"]) => async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.session || req.session.stage !== stage)
        return reply.status(401).send({ error: MSG.auth });
    };

  const throttle = async (reply: FastifyReply, ip: string, user: string | null) => {
    const wait = await retryAfterMs(pool, { ip, username: user }, now());
    if (wait > 0) {
      reply.header("Retry-After", Math.ceil(wait / 1000));
      void reply
        .status(429)
        .send({ error: MSG.throttled, retryAfterSeconds: Math.ceil(wait / 1000) });
      return true;
    }
    return false;
  };

  const fail = async (
    req: FastifyRequest,
    stage: AttemptStage,
    user: string | null,
    userId: string | null,
    label: string,
  ) => {
    const m = meta(req);
    await recordAttempt(pool, { ip: m.ip, username: user, success: false, stage, at: now() });
    await audit(pool, { event: "LOGIN_FAILED", ...m, userId, sessionId: req.session?.id, label });
  };

  /** Replace the presented session with a fresh one (fixation defence) and set the cookie. */
  const issue = async (
    req: FastifyRequest,
    reply: FastifyReply,
    userId: string,
    stage: SessionRow["stage"],
  ) => {
    if (req.session) await revokeSession(pool, req.session.id);
    const s = await createSession(pool, cfg, { userId, stage, ...meta(req), now: now() });
    setCookie(reply, s.token, s.expiresAt);
    return s;
  };

  interface UserRow {
    id: string;
    username: string;
    password_hash: string;
    totp_secret_enc: Buffer | null;
    totp_enabled_at: Date | null;
    totp_last_step: string | null;
  }
  const userById = async (id: string) =>
    (await pool.query<UserRow>("SELECT * FROM users WHERE id = $1", [id])).rows[0];

  const totpContext = (userId: string) => encryptionContext("users", "totp_secret", userId);

  // ------------------------------------------------------------------ state

  app.get("/api/auth/state", async (req) => {
    const users = Number((await pool.query("SELECT count(*) AS n FROM users")).rows[0].n);
    const s = req.session;
    if (!s)
      return {
        setupRequired: users === 0,
        stage: "none" as const,
        idleMinutes: env.SESSION_IDLE_MINUTES,
      };
    const u = await userById(s.user_id);
    return {
      setupRequired: false,
      stage: s.stage,
      setupIncomplete: !u?.totp_enabled_at,
      username: s.stage === "active" ? u?.username : undefined,
      csrfToken: csrfFor(env.SESSION_SECRET, s.id),
      idleMinutes: env.SESSION_IDLE_MINUTES,
    };
  });

  // ------------------------------------------------------------------ first-launch setup

  app.post("/api/auth/setup", async (req, reply) => {
    const body = setupBody.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: "פרטים לא תקינים" });
    const { username: name, password, setupToken } = body.data;
    if (await throttle(reply, req.ip, null)) return;
    if (env.SETUP_TOKEN && !(setupToken && safeEq(setupToken, env.SETUP_TOKEN))) {
      await fail(req, "password", null, null, "setup token");
      return reply.status(403).send({ error: "קוד ההגדרה שגוי" });
    }
    const policy = checkPasswordPolicy(password, name);
    if (!policy.ok)
      return reply.status(422).send({ error: policy.problems[0], problems: policy.problems });

    const passwordHash = await hashPassword(password);
    const secret = generateTotpSecret();
    const client = await pool.connect();
    let userId: string;
    try {
      await client.query("BEGIN");
      const ins = await client.query<{ id: string }>(
        "INSERT INTO users(username, password_hash) VALUES ($1,$2) RETURNING id",
        [name, passwordHash],
      );
      userId = (ins.rows[0] as { id: string }).id;
      await client.query("UPDATE users SET totp_secret_enc = $2 WHERE id = $1", [
        userId,
        totpCrypto.encrypt(secret, totpContext(userId)),
      ]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      if ((e as { code?: string }).code === "23505")
        return reply.status(409).send({ error: MSG.setupDone });
      throw e;
    } finally {
      client.release();
    }
    const s = await issue(req, reply, userId, "pending_totp");
    return reply.status(201).send({
      stage: "pending_totp",
      setupIncomplete: true,
      csrfToken: s.csrf,
      totp: { secret, otpauthUri: otpauthUri(secret, name) },
    });
  });

  /** Shows the pending secret again (page reload mid-setup). Only until the first code is verified. */
  app.get(
    "/api/auth/setup/totp",
    { preHandler: requireStage("pending_totp") },
    async (req, reply) => {
      const u = await userById(cur(req).user_id);
      if (!u || u.totp_enabled_at || !u.totp_secret_enc)
        return reply.status(409).send({ error: MSG.setupDone });
      const secret = totpCrypto.decryptString(u.totp_secret_enc, totpContext(u.id));
      return { totp: { secret, otpauthUri: otpauthUri(secret, u.username) } };
    },
  );

  app.post(
    "/api/auth/setup/verify",
    { preHandler: requireStage("pending_totp") },
    async (req, reply) => {
      const body = codeBody.safeParse(req.body);
      if (!body.success) return reply.status(400).send({ error: MSG.badCode });
      const u = await userById(cur(req).user_id);
      if (!u || u.totp_enabled_at || !u.totp_secret_enc)
        return reply.status(409).send({ error: MSG.setupDone });
      if (await throttle(reply, req.ip, u.username)) return;
      const secret = totpCrypto.decryptString(u.totp_secret_enc, totpContext(u.id));
      const step = verifyTotp(secret, body.data.code, now(), null);
      if (step === null) {
        await fail(req, "totp", u.username, u.id, "setup code");
        return reply.status(401).send({ error: MSG.badCode });
      }
      const codes = generateRecoveryCodes();
      const hashes = [];
      for (const c of codes) hashes.push(await hashPassword(normalizeRecoveryCode(c)));
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const upd = await client.query(
          "UPDATE users SET totp_enabled_at = now(), totp_last_step = $2, updated_at = now() WHERE id = $1 AND totp_enabled_at IS NULL",
          [u.id, step],
        );
        if (upd.rowCount !== 1) {
          await client.query("ROLLBACK");
          return reply.status(409).send({ error: MSG.setupDone });
        }
        await client.query("DELETE FROM recovery_codes WHERE user_id = $1", [u.id]);
        for (const h of hashes)
          await client.query("INSERT INTO recovery_codes(user_id, code_hash) VALUES ($1,$2)", [
            u.id,
            h,
          ]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      await recordAttempt(pool, {
        ip: req.ip,
        username: u.username,
        success: true,
        stage: "totp",
        at: now(),
      });
      const s = await issue(req, reply, u.id, "active");
      await audit(pool, {
        event: "2FA_CHANGED",
        ...meta(req),
        userId: u.id,
        sessionId: s.id,
        label: "enabled",
      });
      await audit(pool, {
        event: "LOGIN_SUCCESS",
        ...meta(req),
        userId: u.id,
        sessionId: s.id,
        label: "setup",
      });
      return { stage: "active", csrfToken: s.csrf, recoveryCodes: codes };
    },
  );

  // ------------------------------------------------------------------ login

  app.post("/api/auth/login", async (req, reply) => {
    const body = loginBody.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: MSG.badCreds });
    const { username: name, password } = body.data;
    if (await throttle(reply, req.ip, name)) return;
    const u = (await pool.query<UserRow>("SELECT * FROM users WHERE username = $1", [name]))
      .rows[0];
    const ok = await verifyPassword(u?.password_hash ?? (await dummyHash()), password);
    if (!u || !ok) {
      await fail(req, "password", name, u?.id ?? null, "password");
      return reply.status(401).send({ error: MSG.badCreds });
    }
    await recordAttempt(pool, {
      ip: req.ip,
      username: u.username,
      success: true,
      stage: "password",
      at: now(),
    });
    const s = await issue(req, reply, u.id, "pending_totp");
    return { stage: "pending_totp", setupIncomplete: !u.totp_enabled_at, csrfToken: s.csrf };
  });

  app.post("/api/auth/totp", { preHandler: requireStage("pending_totp") }, async (req, reply) => {
    const body = codeBody.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: MSG.badCode });
    const u = await userById(cur(req).user_id);
    if (!u || !u.totp_enabled_at || !u.totp_secret_enc)
      return reply.status(409).send({ error: "יש להשלים את הגדרת האימות הדו-שלבי" });
    if (await throttle(reply, req.ip, u.username)) return;
    const secret = totpCrypto.decryptString(u.totp_secret_enc, totpContext(u.id));
    const last = u.totp_last_step === null ? null : Number(u.totp_last_step);
    const step = verifyTotp(secret, body.data.code, now(), last);
    // Atomic claim of the step: two concurrent requests with the same code cannot both win.
    const claimed =
      step === null
        ? false
        : (
            await pool.query(
              "UPDATE users SET totp_last_step = $2 WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2)",
              [u.id, step],
            )
          ).rowCount === 1;
    if (!claimed) {
      await fail(req, "totp", u.username, u.id, "totp");
      await dropAfterRepeatedFailures(req, u.username);
      return reply.status(401).send({ error: MSG.badCode });
    }
    await recordAttempt(pool, {
      ip: req.ip,
      username: u.username,
      success: true,
      stage: "totp",
      at: now(),
    });
    const s = await issue(req, reply, u.id, "active");
    await audit(pool, {
      event: "LOGIN_SUCCESS",
      ...meta(req),
      userId: u.id,
      sessionId: s.id,
      label: "totp",
    });
    return { stage: "active", csrfToken: s.csrf };
  });

  app.post(
    "/api/auth/recovery",
    { preHandler: requireStage("pending_totp") },
    async (req, reply) => {
      const body = codeBody.safeParse(req.body);
      if (!body.success) return reply.status(400).send({ error: MSG.badCode });
      const u = await userById(cur(req).user_id);
      if (!u || !u.totp_enabled_at) return reply.status(409).send({ error: MSG.badCode });
      if (await throttle(reply, req.ip, u.username)) return;
      const code = normalizeRecoveryCode(body.data.code);
      const unused = (
        await pool.query<{ id: string; code_hash: string }>(
          "SELECT id, code_hash FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL",
          [u.id],
        )
      ).rows;
      let matchedId: string | null = null;
      // Check every unused code (no early exit) so timing doesn't reveal which slot matched.
      for (const r of unused)
        if ((await verifyPassword(r.code_hash, code)) && !matchedId) matchedId = r.id;
      const consumed =
        matchedId !== null &&
        (
          await pool.query(
            "UPDATE recovery_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL",
            [matchedId],
          )
        ).rowCount === 1;
      if (!consumed) {
        await fail(req, "recovery", u.username, u.id, "recovery");
        await dropAfterRepeatedFailures(req, u.username);
        return reply.status(401).send({ error: MSG.badCode });
      }
      await recordAttempt(pool, {
        ip: req.ip,
        username: u.username,
        success: true,
        stage: "recovery",
        at: now(),
      });
      const s = await issue(req, reply, u.id, "active");
      await audit(pool, {
        event: "LOGIN_SUCCESS",
        ...meta(req),
        userId: u.id,
        sessionId: s.id,
        label: "recovery code",
      });
      return { stage: "active", csrfToken: s.csrf, recoveryCodesLeft: unused.length - 1 };
    },
  );

  /** Five wrong second-factor codes burn the half-authenticated session: back to the password step. */
  async function dropAfterRepeatedFailures(req: FastifyRequest, user: string) {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM login_attempts
        WHERE username = $1 AND success = false AND stage IN ('totp','recovery') AND at >= $2`,
      [user, cur(req).created_at],
    );
    if (Number(rows[0]?.n) >= 5) await revokeSession(pool, cur(req).id);
  }

  // ------------------------------------------------------------------ logout / lock / sessions

  const logout = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.session) {
      await revokeSession(pool, req.session.id);
      await audit(pool, {
        event: "LOGOUT",
        ...meta(req),
        userId: req.session.user_id,
        sessionId: req.session.id,
      });
    }
    clearCookie(reply);
    return { stage: "none" };
  };
  // "Lock vault" ends the server session too: unlocking means a full login.
  app.post("/api/auth/logout", logout);
  app.post("/api/auth/lock", logout);

  app.get("/api/sessions", { preHandler: requireStage("active") }, async (req) => {
    const rows = await listActive(pool, cfg, cur(req).user_id, now());
    return {
      sessions: rows.map((r) => ({
        id: r.id,
        ip: r.ip,
        userAgent: r.user_agent,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
        expiresAt: r.expires_at,
        current: r.id === cur(req).id,
      })),
    };
  });

  app.delete<{ Params: { id: string } }>(
    "/api/sessions/:id",
    { preHandler: requireStage("active") },
    async (req, reply) => {
      if (!z.string().uuid().safeParse(req.params.id).success)
        return reply.status(400).send({ error: "בקשה לא תקינה" });
      // Scoped to the caller's own user: a session id from elsewhere is simply "not found".
      const own = await pool.query("SELECT 1 FROM sessions WHERE id = $1 AND user_id = $2", [
        req.params.id,
        cur(req).user_id,
      ]);
      if (own.rowCount !== 1 || !(await revokeSession(pool, req.params.id)))
        return reply.status(404).send({ error: "לא נמצא" });
      await audit(pool, {
        event: "SESSION_REVOKED",
        ...meta(req),
        userId: cur(req).user_id,
        sessionId: req.params.id,
      });
      if (req.params.id === cur(req).id) clearCookie(reply);
      return { ok: true };
    },
  );

  app.post("/api/sessions/revoke-others", { preHandler: requireStage("active") }, async (req) => {
    const n = await revokeAllForUser(pool, cur(req).user_id, cur(req).id);
    await audit(pool, {
      event: "SESSION_REVOKED",
      ...meta(req),
      userId: cur(req).user_id,
      sessionId: cur(req).id,
      label: `all others (${n})`,
    });
    return { revoked: n };
  });

  return { requireActive: requireStage("active") };
}
