import type { Pool } from "pg";

/**
 * Brute-force protection backed by login_attempts (survives restarts, one source
 * of truth). After FREE failures within the window the next attempt must wait
 * BASE * 2^(n-FREE) seconds since the last failure, capped at MAX. The cap is
 * what guarantees the administrator is never locked out permanently.
 */
const WINDOW_MS = 15 * 60_000;
const FREE = 5;
const BASE_MS = 30_000;
const MAX_MS = 15 * 60_000;

export type AttemptStage = "password" | "totp" | "recovery";

export function delayFor(failures: number): number {
  if (failures < FREE) return 0;
  return Math.min(MAX_MS, BASE_MS * 2 ** (failures - FREE));
}

async function scopeWait(
  pool: Pool,
  col: "ip" | "username",
  value: string | null | undefined,
  now: number,
): Promise<number> {
  if (!value) return 0;
  const { rows } = await pool.query<{ n: string; last: Date | null }>(
    `SELECT count(*) AS n, max(at) AS last FROM login_attempts
      WHERE ${col} = $1 AND success = false AND at > $2
        AND at > COALESCE((SELECT max(at) FROM login_attempts WHERE ${col} = $1 AND success = true), 'epoch')`,
    [value, new Date(now - WINDOW_MS)],
  );
  const row = rows[0];
  if (!row?.last) return 0;
  const wait = delayFor(Number(row.n)) - (now - row.last.getTime());
  return Math.max(0, wait);
}

/** Milliseconds the caller must still wait (0 = allowed). */
export async function retryAfterMs(
  pool: Pool,
  who: { ip?: string | null; username?: string | null },
  now = Date.now(),
): Promise<number> {
  const [a, b] = await Promise.all([
    scopeWait(pool, "ip", who.ip, now),
    scopeWait(pool, "username", who.username, now),
  ]);
  return Math.max(a, b);
}

export async function recordAttempt(
  pool: Pool,
  a: {
    ip?: string | null;
    username?: string | null;
    success: boolean;
    stage: AttemptStage;
    at?: number;
  },
): Promise<void> {
  await pool.query(
    "INSERT INTO login_attempts(ip, username, success, stage, at) VALUES ($1,$2,$3,$4,$5)",
    [a.ip ?? null, a.username ?? null, a.success, a.stage, new Date(a.at ?? Date.now())],
  );
}
