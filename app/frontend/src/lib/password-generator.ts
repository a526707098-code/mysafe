export interface GeneratorOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  numbers: boolean;
  symbols: boolean;
  /** Drop look-alike characters such as O/0 and l/1/I. */
  avoidAmbiguous: boolean;
}

const SETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/~",
};
const AMBIGUOUS = /[O0oIl1|]/g;

export const DEFAULT_GENERATOR: GeneratorOptions = {
  length: 20,
  upper: true,
  lower: true,
  numbers: true,
  symbols: true,
  avoidAmbiguous: true,
};

/** Unbiased random integer in [0, max) using rejection sampling over CSPRNG output. */
function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0]!;
    if (v < limit) return v % max;
  }
}

export function generatePassword(opts: GeneratorOptions): string {
  const pools = (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((k) => opts[k])
    .map((k) => (opts.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, "") : SETS[k]));
  if (pools.length === 0) return "";
  const length = Math.max(Math.min(opts.length, 128), pools.length);
  // Guarantee one character from every selected class, then fill and shuffle.
  const chars = pools.map((p) => p[randomInt(p.length)]!);
  const all = pools.join("");
  while (chars.length < length) chars.push(all[randomInt(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

/** Rough entropy estimate in bits, for the strength meter only. */
export function estimateEntropy(password: string): number {
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^A-Za-z0-9]/.test(password)) pool += 25;
  return pool === 0 ? 0 : Math.round(password.length * Math.log2(pool));
}

export function strengthLabel(bits: number): { label: string; level: 0 | 1 | 2 | 3 } {
  if (bits < 40) return { label: "חלשה", level: 0 };
  if (bits < 60) return { label: "בינונית", level: 1 };
  if (bits < 90) return { label: "חזקה", level: 2 };
  return { label: "חזקה מאוד", level: 3 };
}
