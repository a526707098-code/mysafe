/**
 * Shapes returned by the vault API. List/detail objects NEVER carry decrypted
 * secrets: a secret is fetched on demand through a dedicated reveal call that
 * the backend audits (PASSWORD_VIEWED, CARD_REVEALED, ...). The mock API in
 * ./api follows the same contract so the UI does not change at integration.
 */

export type SectionKey = "passwords" | "network" | "records" | "cards" | "documents";

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  description?: string;
  section: SectionKey | "all";
}

export interface BaseItem {
  id: string;
  title: string;
  categoryId?: string;
  tags: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PasswordItem extends BaseItem {
  kind: "password";
  websiteName: string;
  url: string;
  username: string;
  notes?: string;
  /** Strength of the stored password, computed server-side at write time. */
  strength: "weak" | "fair" | "strong";
}

export const DEVICE_TYPES = [
  "Router",
  "Switch",
  "NAS",
  "Server",
  "VM",
  "Access Point",
  "Printer",
  "Camera",
  "UPS",
  "Other",
] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export interface NetworkItem extends BaseItem {
  kind: "network";
  deviceType: DeviceType;
  ip: string;
  hostname?: string;
  managementUrl?: string;
  port?: number;
  username?: string;
  location?: string;
  mac?: string;
  vlan?: string;
  notes?: string;
  online?: boolean;
}

export interface CustomField {
  id: string;
  name: string;
  /** Only present for non-sensitive fields. Sensitive values need a reveal call. */
  value?: string;
  sensitive: boolean;
}

export interface RecordItem extends BaseItem {
  kind: "record";
  fields: CustomField[];
  notes?: string;
  attachmentIds: string[];
}

export type CardBrand = "visa" | "mastercard" | "amex" | "isracard" | "diners" | "other";

export interface CardItem extends BaseItem {
  kind: "card";
  holder: string;
  issuer: string;
  brand: CardBrand;
  last4: string;
  /** Expiry is encrypted at rest but shown masked as MM/YY after reveal only. */
  notes?: string;
  gradient: "violet" | "emerald" | "slate" | "rose" | "amber";
  attachmentIds: string[];
}

export interface DocumentItem extends BaseItem {
  kind: "document";
  description?: string;
  mime: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  sizeBytes: number;
  relatedTo?: { kind: SectionKey; id: string; title: string };
  /** Mock-only preview tint; real previews stream from an authenticated endpoint. */
  previewTone: string;
}

export type VaultItem = PasswordItem | NetworkItem | RecordItem | CardItem | DocumentItem;

export type AuditEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PASSWORD_VIEWED"
  | "PASSWORD_COPIED"
  | "RECORD_CREATED"
  | "RECORD_UPDATED"
  | "RECORD_DELETED"
  | "RECORD_RESTORED"
  | "RECORD_PURGED"
  | "SESSION_REVOKED"
  | "FILE_VIEWED"
  | "FILE_UPLOADED"
  | "CARD_REVEALED"
  | "BACKUP_STARTED"
  | "BACKUP_SUCCESS"
  | "BACKUP_FAILED"
  | "2FA_CHANGED";

export interface AuditEvent {
  id: string;
  at: string;
  type: AuditEventType;
  recordRef?: string;
  ip: string;
  userAgent: string;
  sessionId: string;
}

export interface SessionInfo {
  id: string;
  device: string;
  browser: string;
  ip: string;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

export interface BackupRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  kind: "daily" | "weekly" | "monthly" | "manual";
  status: "success" | "failed" | "running";
  dbBytes: number;
  filesBytes: number;
  error?: string;
}

export interface TrashEntry {
  id: string;
  title: string;
  kind: SectionKey;
  deletedAt: string;
  purgeAt: string;
}
