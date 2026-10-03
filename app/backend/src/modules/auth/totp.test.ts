import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, hotp, otpauthUri, verifyTotp } from "./totp.js";

// RFC 4226 appendix D test vectors (secret "12345678901234567890").
const rfc = Buffer.from("12345678901234567890");
test("HOTP matches RFC 4226 vectors", () => {
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676"];
  expected.forEach((code, i) => assert.equal(hotp(rfc, i), code));
});

test("base32 round-trips and matches RFC 4648", () => {
  assert.equal(base32Encode(rfc), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"), rfc);
});

test("TOTP accepts ±1 step, rejects further drift and replay", () => {
  const secret = base32Encode(rfc);
  const t = 59_000; // step 1
  const code = hotp(rfc, 1);
  assert.equal(verifyTotp(secret, code, t, null), 1);
  assert.equal(verifyTotp(secret, code, t + 30_000, null), 1); // one step late
  assert.equal(verifyTotp(secret, code, t + 90_000, null), null); // three steps late
  assert.equal(verifyTotp(secret, code, t, 1), null); // already used
  assert.equal(verifyTotp(secret, "12345", t, null), null);
  assert.equal(verifyTotp(secret, "abcdef", t, null), null);
});

test("otpauth URI carries the parameters authenticator apps need", () => {
  const u = new URL(otpauthUri("ABCDEFGH", "alex"));
  assert.equal(u.protocol, "otpauth:");
  assert.equal(u.searchParams.get("secret"), "ABCDEFGH");
  assert.equal(u.searchParams.get("period"), "30");
  assert.equal(u.searchParams.get("digits"), "6");
});
