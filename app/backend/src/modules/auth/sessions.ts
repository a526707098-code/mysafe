import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export type Stage = "pending_totp" | "active";

export interface SessionRow {
  id: string;
  user_id: string;
  stage: Stage;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
}

export interface SessionConfig {
  sessionSecret: string;
  idleMs: number;
  absoluteMs: number;
  /** pending_totp / first-run setup lifetime */
  pendingMs: number;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

export const newToken = () => randomBytes(32).toString("base64url");

/** Deterministic per-session CSRF token: nothing extra to store or lose, and unforgeable without SESSION_SECRET. */
export const csrfFor = (secret: string, sessionId: string) =>
  createHmac("sha256", secret).update(`csrf:${sessionId}`).digest("base64url");

export function csrfMatches(secret: string, sessionId: string, presented: unknown): boolean {
  if (typeof presented !== "string") return false;
  const a = Buffer.from(csrfFor(secret, sessionId));
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createSession(
  db: Pool | PoolClient,
  cfg: SessionConfig,
  p: { userId: string; stage: Stage; ip: string | null; userAgent: string | null; now?: number },
): Promise<{ id: string; token: string; csrf: string; expiresAt: Date }> {
  const now = p.now ?? Date.now();
  const token = newToken();
  const ttl = p.stage === "active" ? cfg.absoluteMs : cfg.pendingMs;
  const expiresAt = new Date(now + ttl);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO sessions(token_hash, user_id, stage, csrf_hash, ip, user_agent, created_at, last_seen_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8) RETURNING id`,
    [
      sha256(token),
      p.userId,
      p.stage,
      Buffer.alloc(32), // placeholder, replaced below once the id (and so the CSRF token) is known
      p.ip,
      p.userAgent?.slice(0, 300) ?? null,
      new Date(now),
      expiresAt,
    ],
  );
  const id = (rows[0] as { id: string }).id;
  const csrf = csrfFor(cfg.sessionSecret, id);
  await db.query("UPDATE sessions SET csrf_hash = $2 WHERE id = $1", [id, sha256(csrf)]);
  return { id, token, csrf, expiresAt };
}

/** Looks a session up by cookie value; enforces revocation, absolute and idle expiry. */
export async function findSession(
  pool: Pool,
  cfg: SessionConfig,
  token: string | undefined,
  now = Date.now(),
): Promise<SessionRow | null> {
  if (!token || token.length > 128) return null;
  const { rows } = await pool.query<SessionRow>(
    `SELECT id, user_id, stage, ip::text AS ip, user_agent, created_at, last_seen_at, expires_at
       FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL`,
    [sha256(token)],
  );
  const s = rows[0];
  if (!s) return null;
  if (s.expires_at.getTime() <= now) return null;
  if (s.stage === "active" && now - s.last_seen_at.getTime() > cfg.idleMs) return null;
  if (now - s.last_seen_at.getTime() > 5_000) {
    await pool.query("UPDATE sessions SET last_seen_at = $2 WHERE id = $1", [s.id, new Date(now)]);
  }
  return s;
}

export async function revokeSession(db: Pool | PoolClient, id: string): Promise<boolean> {
  const r = await db.query(
    "UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL",
    [id],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function revokeAllForUser(
  db: Pool | PoolClient,
  userId: string,
  exceptId?: string,
): Promise<number> {
  const r = await db.query(
    "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2)",
    [userId, exceptId ?? null],
  );
  return r.rowCount ?? 0;
}

export async function listActive(pool: Pool, cfg: SessionConfig, userId: string, now = Date.now()) {
  const { rows } = await pool.query(
    `SELECT id, ip::text AS ip, user_agent, created_at, last_seen_at, expires_at
       FROM sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND stage = 'active'
        AND expires_at > $2 AND last_seen_at > $3
      ORDER BY last_seen_at DESC`,
    [userId, new Date(now), new Date(now - cfg.idleMs)],
  );
  return rows;
}

/** Housekeeping: drop sessions that can never be valid again. */
export async function purgeDeadSessions(pool: Pool): Promise<number> {
  const r = await pool.query(
    "DELETE FROM sessions WHERE expires_at < now() - interval '1 day' OR revoked_at < now() - interval '30 days'",
  );
  return r.rowCount ?? 0;
}
