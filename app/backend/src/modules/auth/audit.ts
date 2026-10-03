import type { Pool, PoolClient } from "pg";

export type AuditEvent =
  "LOGIN_SUCCESS" | "LOGIN_FAILED" | "LOGOUT" | "2FA_CHANGED" | "SESSION_REVOKED";

export interface AuditEntry {
  event: AuditEvent;
  ip?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  /** A non-secret label, e.g. the reason for a failure. Never user-supplied secrets. */
  label?: string | null;
}

/** Append-only. Callers pass identifiers and fixed labels only — never plaintext secrets. */
export async function audit(db: Pool | PoolClient, e: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_log(event_type, item_label, ip, user_agent, user_id, session_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      e.event,
      e.label ?? null,
      e.ip ?? null,
      e.userAgent?.slice(0, 300) ?? null,
      e.userId ?? null,
      e.sessionId ?? null,
    ],
  );
}
