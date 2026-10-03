import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

// Argon2id (algorithm 2), OWASP-recommended floor: 19 MiB, t=2, p=1 — raised to 64 MiB / t=3.
const OPTS = { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

// Argon2 is memory-hard on purpose; cap concurrent derivations so a burst of login
// attempts cannot exhaust the container's RAM.
const MAX_CONCURRENT = 2;
let active = 0;
const waiting: Array<() => void> = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export const hashPassword = (pw: string) => limited(() => hash(pw, OPTS));

export async function verifyPassword(phc: string, pw: string): Promise<boolean> {
  try {
    return await limited(() => verify(phc, pw));
  } catch {
    return false;
  }
}

/** Verified against when the username does not exist, so timing doesn't reveal it. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(16).toString("hex")));

export interface PolicyResult {
  ok: boolean;
  problems: string[];
}

/** Master-password policy: length first (NIST 800-63B), plus a few cheap sanity checks. */
export function checkPasswordPolicy(pw: string, username: string): PolicyResult {
  const problems: string[] = [];
  if (pw.length < 12) problems.push("הסיסמה חייבת להכיל לפחות 12 תווים");
  if (pw.length > 256) problems.push("הסיסמה ארוכה מדי");
  if (new Set(pw).size < 6) problems.push("הסיסמה חוזרת על עצמה מדי");
  if (username && pw.toLowerCase().includes(username.toLowerCase()))
    problems.push("הסיסמה אינה יכולה להכיל את שם המשתמש");
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length < 16 && classes < 3) problems.push("שלבו אותיות גדולות, קטנות, ספרות או סימנים");
  return { ok: problems.length === 0, problems };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/** 10 recovery codes, 10 chars each (~50 bits), shown as XXXXX-XXXXX. */
export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const b = randomBytes(10);
    const s = Array.from(b, (x) => CODE_ALPHABET[x % 32]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export const normalizeRecoveryCode = (c: string) => c.replace(/[\s-]/g, "").toUpperCase();
