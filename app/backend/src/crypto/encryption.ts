import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { KeyProvider } from "./key-provider.js";

/**
 * The single place where vault data is encrypted. Every sensitive column
 * (passwords, card numbers, sensitive custom fields, notes, TOTP secrets,
 * file metadata) goes through this service; nothing else calls node:crypto
 * ciphers directly.
 *
 * Algorithm: AES-256-GCM, 96-bit random IV per value, 128-bit auth tag.
 *
 * Stored envelope (one BYTEA column, so IV/tag/ciphertext can never be
 * mismatched by a partial update):
 *
 *   offset  size  field
 *   0       1     format version (currently 1)
 *   1       2     key version, uint16 big-endian
 *   3       12    IV / nonce
 *   15      16    GCM authentication tag
 *   31      n     ciphertext
 *
 * The `context` string is bound as GCM additional authenticated data, e.g.
 * "password_items.password:<row uuid>". A ciphertext copied into another row
 * or column then fails to decrypt instead of silently revealing the wrong
 * secret.
 */

const FORMAT_VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = 1 + 2 + IV_LEN + TAG_LEN;

export class DecryptionError extends Error {
  constructor(reason: string) {
    // Deliberately generic: callers surface "could not decrypt" without detail.
    super(`decryption failed: ${reason}`);
  }
}

export interface EnvelopeParts {
  formatVersion: number;
  keyVersion: number;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

export class EncryptionService {
  constructor(private readonly keys: KeyProvider) {}

  encrypt(plaintext: string | Buffer, context: string): Buffer {
    const keyVersion = this.keys.currentVersion();
    const key = this.keys.key(keyVersion);
    if (!key) throw new Error("current encryption key is unavailable");
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
    cipher.setAAD(Buffer.from(context, "utf8"));
    const data = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const header = Buffer.alloc(3);
    header.writeUInt8(FORMAT_VERSION, 0);
    header.writeUInt16BE(keyVersion, 1);
    return Buffer.concat([header, iv, cipher.getAuthTag(), ciphertext]);
  }

  decrypt(envelope: Buffer, context: string): Buffer {
    const parts = parseEnvelope(envelope);
    const key = this.keys.key(parts.keyVersion);
    if (!key) throw new DecryptionError("unknown key version");
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, parts.iv, { authTagLength: TAG_LEN });
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(parts.authTag);
      return Buffer.concat([decipher.update(parts.ciphertext), decipher.final()]);
    } catch {
      throw new DecryptionError("authentication failed");
    }
  }

  decryptString(envelope: Buffer, context: string): string {
    return this.decrypt(envelope, context).toString("utf8");
  }

  /** True when the value was written with an older key and should be re-encrypted. */
  needsRotation(envelope: Buffer): boolean {
    return parseEnvelope(envelope).keyVersion !== this.keys.currentVersion();
  }

  /** Re-encrypt under the current key (used by the key-rotation job). */
  rotate(envelope: Buffer, context: string): Buffer {
    return this.encrypt(this.decrypt(envelope, context), context);
  }
}

export function parseEnvelope(envelope: Buffer): EnvelopeParts {
  if (envelope.length < HEADER_LEN) throw new DecryptionError("envelope too short");
  const formatVersion = envelope.readUInt8(0);
  if (formatVersion !== FORMAT_VERSION) throw new DecryptionError("unsupported format");
  return {
    formatVersion,
    keyVersion: envelope.readUInt16BE(1),
    iv: envelope.subarray(3, 3 + IV_LEN),
    authTag: envelope.subarray(3 + IV_LEN, HEADER_LEN),
    ciphertext: envelope.subarray(HEADER_LEN),
  };
}

/** AAD helper so contexts are spelled the same everywhere. */
export const encryptionContext = (table: string, column: string, rowId: string) =>
  `${table}.${column}:${rowId}`;
