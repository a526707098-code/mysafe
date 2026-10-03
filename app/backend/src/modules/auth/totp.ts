import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — the profile every authenticator app supports. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret, as recommended by RFC 4226. */
export const generateTotpSecret = () => base32Encode(randomBytes(20));

export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const offset = h.readUInt8(h.length - 1) & 0x0f;
  const bin = h.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

export const totpStep = (nowMs: number) => Math.floor(nowMs / 1000 / TOTP_PERIOD);

/**
 * Returns the matched time step (so the caller can refuse to accept the same
 * step twice) or null. Accepts ±1 step to tolerate clock drift.
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  nowMs: number,
  lastUsedStep: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const current = totpStep(nowMs);
  let matched: number | null = null;
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(hotp(secret, step));
    // Evaluate every candidate: no early exit that leaks which step matched.
    if (timingSafeEqual(expected, Buffer.from(code)) && matched === null) matched = step;
  }
  if (matched === null) return null;
  if (lastUsedStep !== null && matched <= lastUsedStep) return null;
  return matched;
}

export function otpauthUri(secretB32: string, account: string, issuer = "Private Vault"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const q = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${label}?${q.toString()}`;
}
