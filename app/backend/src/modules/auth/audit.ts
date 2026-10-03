import type { Pool, PoolClient } from "pg";

export type AuditEvent =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "2FA_CHANGED"
  | "SESSION_REVOKED"
  | "PASSWORD_VIEWED"
  | "PASSWORD_COPIED"
  | "CARD_REVEALED"
  | "RECORD_CREATED"
  | "RECORD_UPDATED"
  | "RECORD_DELETED"
  | "RECORD_RESTORED"
  | "RECORD_PURGED";

export interface AuditEntry {
  event: AuditEvent;
  ip?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  /** A non-secret label, e.g. the reason for a failure. Never user-supplied secrets. */
  label?: string | null;
  /** The vault item concerned (no FK: history outlives purged items). */
  itemId?: string | null;
}

/** Append-only. Callers pass identifiers and fixed labels only — never plaintext secrets. */
export async function audit(db: Pool | PoolClient, e: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_log(event_type, item_label, ip, user_agent, user_id, session_id, item_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      e.event,
      e.label ?? null,
      e.ip ?? null,
      e.userAgent?.slice(0, 300) ?? null,
      e.userId ?? null,
      e.sessionId ?? null,
      e.itemId ?? null,
    ],
  );
}
