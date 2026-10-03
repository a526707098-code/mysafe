/** Rough strength label stored with a password item (computed server-side at write time). */
export function passwordStrength(pw: string): "weak" | "fair" | "strong" {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  // Repeated characters add little: count at most twice the distinct characters.
  const effectiveLength = Math.min(pw.length, new Set(pw).size * 2);
  const bits = pool === 0 ? 0 : effectiveLength * Math.log2(pool);
  if (pw.length < 8 || bits < 45) return "weak";
  if (pw.length >= 14 && bits >= 80) return "strong";
  return "fair";
}
