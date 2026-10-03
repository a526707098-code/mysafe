"use client";

/**
 * Boundary between UI and backend. Every call here maps 1:1 to a REST endpoint
 * documented in docs/ARCHITECTURE.md. Authentication is live (auth-client.ts);
 * the vault data below still resolves against mock data until phase 3.
 */
import { mockSecrets } from "./mock-data";
import { vault } from "./vault-store";
import type { AuditEventType } from "./types";
import { auth, MOCK_AUTH } from "./auth-client";
import { ApiError } from "./errors";

const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms));

export type SecretKind = "password" | "network" | "field" | "card";

/** Secrets created in the prototype session live here, standing in for the server. */
const sessionSecrets = new Map<string, string>();

const viewEvent: Record<SecretKind, AuditEventType> = {
  password: "PASSWORD_VIEWED",
  network: "PASSWORD_VIEWED",
  field: "PASSWORD_VIEWED",
  card: "CARD_REVEALED",
};

export const api = {
  /** POST /api/auth/login -> pending_totp session ; never reveals which part was wrong. */
  async login(username: string, password: string): Promise<{ setupIncomplete: boolean }> {
    if (!MOCK_AUTH)
      return { setupIncomplete: (await auth.login(username.trim(), password)).setupIncomplete };
    await delay(500);
    if (!username.trim() || password.length < 1) throw new ApiError("שם המשתמש או הסיסמה שגויים");
    return { setupIncomplete: false };
  },

  /** POST /api/auth/totp -> sets the session cookie. Prototype accepts any 6 digits. */
  async verifyTotp(code: string): Promise<void> {
    if (!MOCK_AUTH) {
      await auth.totp(code);
      return;
    }
    await delay(500);
    if (!/^\d{6}$/.test(code)) throw new ApiError("קוד האימות שגוי או שפג תוקפו");
    vault.log("LOGIN_SUCCESS");
  },

  /** POST /api/auth/recovery -> single-use recovery code instead of TOTP. */
  async verifyRecoveryCode(code: string): Promise<void> {
    if (!MOCK_AUTH) {
      await auth.recovery(code.trim());
      return;
    }
    await delay(500);
    if (!/^[A-Z0-9]{5}-[A-Z0-9]{5}$/i.test(code.trim())) throw new ApiError("קוד השחזור אינו תקין");
  },

  /** POST /api/secrets/:kind/:id/reveal — audited server-side. */
  async revealSecret(kind: SecretKind, id: string, label: string): Promise<string> {
    await delay();
    const value = sessionSecrets.get(id) ?? mockSecrets[id];
    if (value === undefined) throw new ApiError("לא ניתן לפענח את הערך");
    vault.log(viewEvent[kind], `${id} · ${label}`);
    return value;
  },

  /** Copy goes through the same reveal endpoint with ?purpose=copy for a distinct audit event. */
  async copySecret(kind: SecretKind, id: string, label: string): Promise<string> {
    await delay(120);
    const value = sessionSecrets.get(id) ?? mockSecrets[id];
    if (value === undefined) throw new ApiError("לא ניתן לפענח את הערך");
    vault.log(kind === "card" ? "CARD_REVEALED" : "PASSWORD_COPIED", `${id} · ${label}`);
    return value;
  },

  /** Part of POST/PUT on the item: the secret travels once and is encrypted server-side. */
  async storeSecret(id: string, value: string): Promise<void> {
    await delay(80);
    sessionSecrets.set(id, value);
  },

  async logout(): Promise<void> {
    if (!MOCK_AUTH) return auth.logout().catch(() => undefined);
    await delay(100);
    vault.log("LOGOUT");
  },
};

export { ApiError };
