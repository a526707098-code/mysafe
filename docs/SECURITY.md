# Security model

## Threats considered

| Threat | Mitigation |
|---|---|
| Database dump stolen | Secrets are AES-256-GCM ciphertext; keys live only in `.env` / the process |
| Backup archive stolen | Backups are encrypted with `BACKUP_PASSPHRASE` before leaving the host |
| Password guessing | Argon2id, nginx `limit_req`, per-IP + per-username backoff, temporary lockout, mandatory TOTP |
| Session theft | `HttpOnly; Secure; SameSite=Strict` cookie, only SHA-256 of the token stored, 15 min idle + 12 h absolute expiry, revocable |
| CSRF | Origin check + per-session CSRF token on every write |
| XSS | React escaping, nonce-based CSP without `'unsafe-inline'`, no third-party scripts/fonts |
| Ciphertext swapping in the DB | GCM AAD binds each value to `table.column:rowId` |
| Shoulder surfing | Secrets hidden by default, auto-hide after 10 s, hidden when the tab loses focus |
| Clipboard leakage | Best-effort clear 30 s after copying |
| Malicious upload | MIME + extension + magic-byte checks, size limit, image re-encoding, never served from a static path |
| Info leaks in errors | Generic error bodies with a request id in production; details only in server logs |
| Secrets in logs | Fastify logger redaction; audit log never receives values; nginx logs omit query strings |
| Lateral movement on the VPS | Dedicated PostgreSQL instance and role, internal Docker network, read-only containers, no capabilities |

## Not stored

* CVV codes (only possible with `ALLOW_CVV_STORAGE=true`, which also shows a warning).
* "Remember this device" for 2FA (deliberately absent).
* Plaintext of anything in `*_enc` columns, audit rows, or logs.

## Recovery without permanent lockout

Lockouts are temporary (15 min after 5 failures). Losing the authenticator: use a recovery
code. Losing both: on the server, `docker compose exec private-vault-api node dist/cli/reset-2fa.js`
(phase 2) disables TOTP for the account and writes a `2FA_CHANGED` audit event; the next
login forces a new TOTP setup. Losing `ENCRYPTION_KEY` is unrecoverable by design: keep an
offline copy of `.env`.

## Known limitations of phase 1

* The UI is a prototype on mock data; authentication is simulated (any credentials, any
  6-digit code). Do not put real data into it.
* The app role owns its tables, so a compromised app could in theory drop the audit
  trigger. Phase 7 splits a migration-owner role from a runtime role with only
  INSERT/SELECT on `audit_log`.

## Recommendations

* Reach the vault over Tailscale or another private network; do not expose it publicly.
* Keep `VAULT_BIND=127.0.0.1` (default) unless binding a tailnet address.
* Store `.env` and recovery codes offline (password manager on another device, paper).
* Keep the host patched; `docker compose pull && docker compose up -d --build` monthly.
