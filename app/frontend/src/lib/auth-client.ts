"use client";

/**
 * Real backend calls for authentication. The session cookie is HttpOnly and
 * invisible to JavaScript; the only thing kept here is the CSRF token, which
 * the server derives per session and hands back on every login step.
 */
import { ApiError } from "./errors";

/** Demo build only (npm run dev:mock): fake login, no backend. Never set in Docker. */
export const MOCK_AUTH = process.env.NEXT_PUBLIC_MOCK_AUTH === "1";

let csrf = "";

export interface AuthState {
  setupRequired: boolean;
  stage: "none" | "pending_totp" | "active";
  setupIncomplete?: boolean;
  username?: string;
  idleMinutes: number;
}

export interface TotpEnrollment {
  secret: string;
  otpauthUri: string;
}

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("אין חיבור לשרת. נסו שוב.");
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* non-JSON error page */
  }
  if (typeof json.csrfToken === "string") csrf = json.csrfToken;
  if (!res.ok) {
    const wait = typeof json.retryAfterSeconds === "number" ? json.retryAfterSeconds : 0;
    const msg = typeof json.error === "string" ? json.error : "אירעה שגיאה. נסו שוב.";
    throw new ApiError(wait ? `${msg} (${wait} שניות)` : msg);
  }
  return json as T;
}

export const auth = {
  state: () => http<AuthState & { csrfToken?: string }>("GET", "/api/auth/state"),
  login: (username: string, password: string) =>
    http<{ stage: "pending_totp"; setupIncomplete: boolean }>("POST", "/api/auth/login", {
      username,
      password,
    }),
  totp: (code: string) => http<{ stage: "active" }>("POST", "/api/auth/totp", { code }),
  recovery: (code: string) =>
    http<{ stage: "active"; recoveryCodesLeft: number }>("POST", "/api/auth/recovery", { code }),
  logout: async () => {
    try {
      await http("POST", "/api/auth/logout", {});
    } finally {
      csrf = "";
    }
  },
  setup: (username: string, password: string, setupToken: string) =>
    http<{ totp: TotpEnrollment }>("POST", "/api/auth/setup", { username, password, setupToken }),
  setupTotp: () => http<{ totp: TotpEnrollment }>("GET", "/api/auth/setup/totp"),
  setupVerify: (code: string) =>
    http<{ stage: "active"; recoveryCodes: string[] }>("POST", "/api/auth/setup/verify", { code }),
};
