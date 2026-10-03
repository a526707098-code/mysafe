import { test } from "node:test";
import assert from "node:assert/strict";
import { delayFor } from "./rate-limit.js";
import {
  checkPasswordPolicy,
  generateRecoveryCodes,
  hashPassword,
  normalizeRecoveryCode,
  verifyPassword,
} from "./passwords.js";

test("Argon2id hash verifies and is salted", async () => {
  const h = await hashPassword("correct horse battery staple");
  assert.match(h, /^\$argon2id\$/);
  assert.equal(await verifyPassword(h, "correct horse battery staple"), true);
  assert.equal(await verifyPassword(h, "wrong"), false);
  assert.notEqual(h, await hashPassword("correct horse battery staple"));
  assert.equal(await verifyPassword("garbage", "x"), false);
});

test("password policy", () => {
  assert.equal(checkPasswordPolicy("short1A!", "alex").ok, false);
  assert.equal(checkPasswordPolicy("alexalexalexalex", "alex").ok, false);
  assert.equal(checkPasswordPolicy("aaaaaaaaaaaaaaaa", "alex").ok, false);
  assert.equal(checkPasswordPolicy("Tr1cky-Vault-Pass!", "alex").ok, true);
  assert.equal(checkPasswordPolicy("four random words in a row", "alex").ok, true);
});

test("recovery codes are unique, well-formed and normalise", () => {
  const codes = generateRecoveryCodes();
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  assert.equal(normalizeRecoveryCode(" abcde-fghjk "), "ABCDEFGHJK");
});

test("lockout delay grows, is capped, and is never permanent", () => {
  assert.equal(delayFor(4), 0);
  assert.equal(delayFor(5), 30_000);
  assert.equal(delayFor(6), 60_000);
  assert.equal(delayFor(50), 15 * 60_000);
});
