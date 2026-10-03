import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { EncryptionService, encryptionContext, parseEnvelope } from "./encryption.js";
import { EnvKeyProvider } from "./key-provider.js";

const k1 = randomBytes(32).toString("base64");
const k2 = randomBytes(32).toString("base64");
const ctx = encryptionContext("password_items", "password", "6f1c0d9e-0000-4000-8000-000000000001");

test("round-trips a secret and never stores the plaintext", () => {
  const svc = new EncryptionService(new EnvKeyProvider(1, k1));
  const env = svc.encrypt("hunter2-demo", ctx);
  assert.equal(svc.decryptString(env, ctx), "hunter2-demo");
  assert.equal(env.includes(Buffer.from("hunter2-demo")), false);
});

test("uses a fresh IV for every value", () => {
  const svc = new EncryptionService(new EnvKeyProvider(1, k1));
  const a = parseEnvelope(svc.encrypt("same", ctx));
  const b = parseEnvelope(svc.encrypt("same", ctx));
  assert.notDeepEqual(a.iv, b.iv);
  assert.notDeepEqual(a.ciphertext, b.ciphertext);
});

test("records format version, key version, IV and tag", () => {
  const svc = new EncryptionService(new EnvKeyProvider(3, k1));
  const parts = parseEnvelope(svc.encrypt("x", ctx));
  assert.equal(parts.formatVersion, 1);
  assert.equal(parts.keyVersion, 3);
  assert.equal(parts.iv.length, 12);
  assert.equal(parts.authTag.length, 16);
});

test("rejects tampered ciphertext", () => {
  const svc = new EncryptionService(new EnvKeyProvider(1, k1));
  const env = svc.encrypt("card 4111", ctx);
  env.writeUInt8(env.readUInt8(env.length - 1) ^ 0x01, env.length - 1);
  assert.throws(() => svc.decrypt(env, ctx), /decryption failed/);
});

test("rejects a ciphertext moved to another row (AAD binding)", () => {
  const svc = new EncryptionService(new EnvKeyProvider(1, k1));
  const env = svc.encrypt("secret", ctx);
  const otherRow = encryptionContext(
    "password_items",
    "password",
    "6f1c0d9e-0000-4000-8000-000000000002",
  );
  assert.throws(() => svc.decrypt(env, otherRow), /decryption failed/);
});

test("rejects decryption with the wrong key", () => {
  const env = new EncryptionService(new EnvKeyProvider(1, k1)).encrypt("secret", ctx);
  assert.throws(() => new EncryptionService(new EnvKeyProvider(1, k2)).decrypt(env, ctx));
});

test("reads old-key data after rotation and re-encrypts it under the new key", () => {
  const old = new EncryptionService(new EnvKeyProvider(1, k1));
  const env = old.encrypt("rotate me", ctx);
  const rotated = new EncryptionService(new EnvKeyProvider(2, k2, k1));
  assert.equal(rotated.needsRotation(env), true);
  const fresh = rotated.rotate(env, ctx);
  assert.equal(parseEnvelope(fresh).keyVersion, 2);
  assert.equal(rotated.decryptString(fresh, ctx), "rotate me");
  assert.equal(rotated.needsRotation(fresh), false);
});

test("refuses keys that are not 32 bytes", () => {
  assert.throws(() => new EnvKeyProvider(1, Buffer.alloc(16).toString("base64")), /32 bytes/);
});
