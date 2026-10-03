/**
 * Where data-encryption keys come from. Today: environment variables. The
 * interface exists so a secret manager (Vault, a KMS, systemd-creds, an HSM)
 * can be dropped in without touching any code that encrypts data.
 */
export interface KeyProvider {
  /** Version that new ciphertext is written with. */
  currentVersion(): number;
  /** Key bytes for a version, or undefined if that version is no longer available. */
  key(version: number): Buffer | undefined;
}

export class EnvKeyProvider implements KeyProvider {
  private readonly keys = new Map<number, Buffer>();

  constructor(
    private readonly version: number,
    current: string,
    previous?: string,
  ) {
    this.keys.set(version, decodeKey(current, "ENCRYPTION_KEY"));
    if (previous) {
      if (version <= 1)
        throw new Error("ENCRYPTION_KEY_PREVIOUS requires ENCRYPTION_KEY_VERSION > 1");
      this.keys.set(version - 1, decodeKey(previous, "ENCRYPTION_KEY_PREVIOUS"));
    }
  }

  currentVersion() {
    return this.version;
  }

  key(version: number) {
    return this.keys.get(version);
  }
}

export function decodeKey(b64: string, name: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error(`${name} must decode to exactly 32 bytes`);
  return key;
}
